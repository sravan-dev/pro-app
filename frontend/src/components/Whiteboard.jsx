import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDataChannel, useLocalParticipant, useParticipants } from '@livekit/components-react';

// Shared whiteboard drawn over the LiveKit data channel — no server state, the
// room itself carries the strokes. Points are stored in 0..1 space so a stroke
// drawn on a laptop lands in the same place on a phone.
//
// Wire protocol (topic 'wb'):
//   { t: 'seg',   id, color, width, erase, pts:[{x,y}] }  append to a stroke
//   { t: 'del',   id }                                     drop one stroke
//   { t: 'clear' }                                        wipe the board
//   { t: 'req' }                                          newcomer wants state
//   { t: 'sync',  strokes }                               answer to 'req'
//   { t: 'open',  open }                                  show/hide for everyone
const COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#ffffff'];
const WIDTHS = [2, 4, 8, 16];

// Only one participant answers a state request, otherwise every board in the
// room replies at once. The longest-present participant is the one.
function useIsSyncAnswerer() {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const oldest = [...participants].sort(
    (a, b) => (a.joinedAt?.getTime?.() || 0) - (b.joinedAt?.getTime?.() || 0),
  )[0];
  return !!oldest && oldest.identity === localParticipant?.identity;
}

export default function Whiteboard({ canDraw = true, canClear = true, onClose = null }) {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);          // committed + in-progress strokes
  const drawingRef = useRef(null);        // stroke being drawn locally
  const pendingRef = useRef([]);          // points not yet broadcast
  const isAnswerer = useIsSyncAnswerer();

  const [color, setColor] = useState('#111827');
  const [width, setWidth] = useState(4);
  const [erasing, setErasing] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokesRef.current.forEach((s) => {
      if (s.pts.length < 1) return;
      ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * (w / 1000);
      ctx.beginPath();
      s.pts.forEach((p, i) => {
        const x = p.x * w;
        const y = p.y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      // A single tap should still leave a dot.
      if (s.pts.length === 1) ctx.lineTo(s.pts[0].x * w + 0.01, s.pts[0].y * h);
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const applyMessage = useCallback((msg) => {
    if (!msg) return;
    if (msg.t === 'clear') { strokesRef.current = []; draw(); return; }
    if (msg.t === 'del') { strokesRef.current = strokesRef.current.filter((s) => s.id !== msg.id); draw(); return; }
    if (msg.t === 'sync') { strokesRef.current = msg.strokes || []; draw(); return; }
    if (msg.t === 'seg') {
      const existing = strokesRef.current.find((s) => s.id === msg.id);
      if (existing) existing.pts.push(...msg.pts);
      else strokesRef.current.push({ id: msg.id, color: msg.color, width: msg.width, erase: msg.erase, pts: [...msg.pts] });
      draw();
    }
  }, [draw]);

  const { send } = useDataChannel('wb', (raw) => {
    let msg;
    try { msg = JSON.parse(new TextDecoder().decode(raw.payload)); } catch { return; }
    if (msg.t === 'req') {
      if (isAnswerer && strokesRef.current.length) {
        // `mine` is local bookkeeping for undo; it must not travel.
        publish({ t: 'sync', strokes: strokesRef.current.map(({ mine, ...s }) => s) });
      }
      return;
    }
    applyMessage(msg);
  });

  const publish = useCallback((msg) => {
    try { send(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true }); }
    catch { /* not connected yet */ }
  }, [send]);

  // Ask whoever is already here for the board as it stands.
  useEffect(() => {
    const t = setTimeout(() => publish({ t: 'req' }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the backing store in step with the element's rendered size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // Points are batched so a fast scribble is a handful of messages, not one
  // per pointer event.
  const flush = useCallback(() => {
    const stroke = drawingRef.current;
    if (!stroke || !pendingRef.current.length) return;
    publish({ t: 'seg', id: stroke.id, color: stroke.color, width: stroke.width, erase: stroke.erase, pts: pendingRef.current });
    pendingRef.current = [];
  }, [publish]);

  const pointAt = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const onPointerDown = (e) => {
    if (!canDraw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const stroke = {
      id: `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
      color, width, erase: erasing, pts: [pointAt(e)], mine: true,
    };
    drawingRef.current = stroke;
    strokesRef.current.push(stroke);
    pendingRef.current = [...stroke.pts];
    draw();
  };

  const onPointerMove = (e) => {
    const stroke = drawingRef.current;
    if (!stroke) return;
    const p = pointAt(e);
    stroke.pts.push(p);
    pendingRef.current.push(p);
    draw();
    if (pendingRef.current.length >= 6) flush();
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    flush();
    drawingRef.current = null;
  };

  const undoMine = () => {
    // Only your own last stroke — nobody's work disappears under them.
    const mine = strokesRef.current.filter((s) => s.mine);
    const last = mine[mine.length - 1];
    if (!last) return;
    strokesRef.current = strokesRef.current.filter((s) => s !== last);
    draw();
    publish({ t: 'del', id: last.id });
  };

  const clearAll = () => {
    strokesRef.current = [];
    draw();
    publish({ t: 'clear' });
  };

  return (
    <div style={{ background: '#0f172a', borderRadius: 10, padding: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e5e7eb' }}>Whiteboard</span>
        {canDraw && (
          <>
            <div style={{ display: 'flex', gap: 4 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setColor(c); setErasing(false); }}
                  title={c}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: color === c && !erasing ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.35)' }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  title={`${w}px`}
                  style={{ width: 24, height: 22, borderRadius: 6, cursor: 'pointer', color: '#e5e7eb', fontSize: 11,
                    background: width === w ? '#4338ca' : 'rgba(255,255,255,0.08)', border: 'none' }}
                >
                  {w}
                </button>
              ))}
            </div>
            <button
              onClick={() => setErasing((v) => !v)}
              style={{ borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: '#e5e7eb',
                background: erasing ? '#4338ca' : 'rgba(255,255,255,0.08)', border: 'none' }}
            >
              Eraser
            </button>
            <button
              onClick={undoMine}
              style={{ borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: '#e5e7eb', background: 'rgba(255,255,255,0.08)', border: 'none' }}
            >
              Undo
            </button>
          </>
        )}
        {canClear && (
          <button
            onClick={clearAll}
            style={{ borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: '#fecaca', background: 'rgba(220,38,38,0.25)', border: 'none' }}
          >
            Clear
          </button>
        )}
        {!canDraw && <span style={{ fontSize: 12, color: '#94a3b8' }}>View only — ask to be put on stage to draw.</span>}
        {onClose && (
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: '#e5e7eb', background: 'rgba(255,255,255,0.08)', border: 'none' }}
          >
            Hide
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
        style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: '48vh', display: 'block', borderRadius: 8,
          background: '#fff', touchAction: 'none', cursor: canDraw ? 'crosshair' : 'default' }}
      />
    </div>
  );
}
