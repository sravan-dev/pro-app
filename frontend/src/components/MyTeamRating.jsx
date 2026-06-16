import React, { useState, useEffect } from 'react';
import { api } from '../api';
import StarRating from './StarRating';

const ROLE_LABEL = { manager: 'Team Manager', advisor: 'Team Advisor', tutor: 'Tutor' };

function PersonCard({ slot, person, onSaved, onToast }) {
  const [stars, setStars] = useState(person?.my_rating?.stars || 0);
  const [comment, setComment] = useState(person?.my_rating?.comment || '');
  const [saving, setSaving] = useState(false);

  if (!person) {
    return (
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '1.25rem', opacity: 0.7 }}>
        <h3 style={{ margin: '0 0 6px' }}>{ROLE_LABEL[slot]}</h3>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Not assigned yet.</p>
      </div>
    );
  }

  const save = async () => {
    if (!(stars >= 1)) { onToast('Pick a star rating first.', 'error'); return; }
    setSaving(true);
    try {
      await api.submitRating({ ratee_id: person.id, ratee_role: slot, stars, comment });
      onToast(`Rating saved for ${person.name}.`, 'success');
      onSaved();
    } catch (err) {
      onToast(err.message || 'Failed to save rating', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="avatar" style={{ width: 48, height: 48, fontSize: 18, backgroundColor: person.avatar_color || '#4F46E5' }}>{person.name?.[0]}</div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{ROLE_LABEL[slot]}</div>
          <strong>{person.name}</strong>
        </div>
      </div>
      <StarRating value={stars} onChange={setStars} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional feedback…"
        rows={2}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <button className="btn btn-primary" disabled={saving} onClick={save} style={{ alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : (person.my_rating ? 'Update Rating' : 'Submit Rating')}
      </button>
    </div>
  );
}

export default function MyTeamRating() {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);

  const load = () => {
    setLoading(true);
    api.getMyTeam()
      .then((t) => { setTeam(t); setError(''); })
      .catch((err) => setError(err.message || 'Failed to load your team'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toast = (text, type = 'info') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };

  if (loading) return <div className="portal-page"><h2>My Team</h2><div className="spinner" /></div>;

  const anyAssigned = team && (team.manager || team.advisor || team.tutor);

  return (
    <div className="portal-page">
      <h2>My Team</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
        Rate the people supporting your learning journey. You can update your ratings anytime.
      </p>
      {error && <div style={{ color: '#dc2626', margin: '8px 0' }}>{error}</div>}
      {msg && <div className={`alert alert-${msg.type}`} style={{ margin: '8px 0' }}>{msg.text}</div>}
      {!anyAssigned ? (
        <p className="empty-state">You haven't been assigned a team yet. Check back once your advisor and tutor are set.</p>
      ) : (
        <div className="card-grid" style={{ marginTop: '1rem' }}>
          {['manager', 'advisor', 'tutor'].map((slot) => (
            <PersonCard
              key={slot}
              slot={slot}
              person={team[slot]}
              onSaved={load}
              onToast={toast}
            />
          ))}
        </div>
      )}
    </div>
  );
}
