import React, { useEffect, useState } from 'react';
import { api } from '../api';
import DataTable from './DataTable';
import KPICard from './KPICard';
import { formatMoney } from '../utils/money';

// Full page for one Kajabi contact: profile and address, tags, notes, and —
// when they're also a Kajabi customer — products, offers and purchases. Also
// shows whether the email already belongs to an LMS account. `contact` is the
// list row (shown straight away while the rest loads); `onEnroll` reuses the
// list's Enroll flow.
const muted = { color: 'var(--color-text-secondary)' };
const card = { background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '1.25rem' };
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '—');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString() : '—');
const cents = (n, currency) => formatMoney((Number(n) || 0) / 100, currency || 'USD');

function Field({ label, children }) {
  return (
    <div>
      <div style={{ ...muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ wordBreak: 'break-word' }}>{children || <span style={muted}>—</span>}</div>
    </div>
  );
}

export default function KajabiContactDetail({ contact, onBack, onEnroll, enrollBusy }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDetail(null);
    setError('');
    api.getKajabiContact(contact.id).then(setDetail).catch((e) => setError(e.message || 'Could not load contact'));
  }, [contact.id]);

  const c = detail?.contact;
  const name = c?.name || (contact.name !== '—' ? contact.name : '') || contact.email;
  const email = c?.email || contact.email;
  const addr = c?.address || {};
  const addressLines = [addr.line1, addr.line2, [addr.city, addr.state, addr.zip].filter(Boolean).join(', '), addr.country].filter(Boolean);
  const cust = detail?.customer;
  const lms = detail?.lms_user;
  const currency = detail?.purchases?.[0]?.currency || detail?.offers?.[0]?.currency || 'USD';

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '1rem' }}>← Back to Kajabi Contacts</button>

      <div className="page-header" style={{ alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
          <div className="avatar" style={{ width: 64, height: 64, fontSize: 24, backgroundColor: '#1A6DFF', color: '#fff', flexShrink: 0 }}>
            {(name || '?')[0]?.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, wordBreak: 'break-word' }}>{name}</h2>
            <div style={muted}>{email}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {c && (c.subscribed
                ? <span className="role-badge role-tutor">subscribed</span>
                : <span className="role-badge" style={{ background: '#F3F4F6', color: '#6B7280' }}>unsubscribed</span>)}
              {cust && <span className="role-badge role-advisor">Kajabi customer</span>}
              {lms && <span className={`role-badge role-${lms.role}`}>LMS {lms.role}</span>}
            </div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onEnroll(contact)} disabled={enrollBusy || !email}>Enroll</button>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}
      {!detail && !error && <div style={{ marginTop: '1rem' }}><div className="spinner" /><p>Loading contact details…</p></div>}

      {detail && (
        <>
          {cust && (
            <div className="kpi-grid" style={{ marginTop: '1rem' }}>
              <KPICard title="Products" value={detail.products.length} icon="book" color="#3B82F6" />
              <KPICard title="Offers" value={detail.offers.length} icon="layers" color="#8B5CF6" />
              <KPICard title="Net Revenue" value={formatMoney(Number(cust.net_revenue) || 0, currency)} icon="percent" color="#10B981" />
              <KPICard title="Sign-ins" value={cust.sign_in_count ?? '—'} icon="check-circle" color="#F59E0B" />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
            <div style={card}>
              <h3 style={{ marginTop: 0 }}>Contact</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.9rem' }}>
                <Field label="Email">{email}</Field>
                <Field label="Phone">{c.phone}</Field>
                <Field label="Business number">{c.business_number}</Field>
                <Field label="External user ID">{c.external_user_id}</Field>
                <Field label="Contact since">{fmtDate(c.created_at)}</Field>
                <Field label="Last updated">{fmtDate(c.updated_at)}</Field>
              </div>
              <div style={{ marginTop: '0.9rem' }}>
                <Field label="Address">{addressLines.length ? addressLines.map((l) => <div key={l}>{l}</div>) : null}</Field>
              </div>
              <div style={{ marginTop: '0.9rem' }}>
                <Field label="Tags">
                  {detail.tags.length ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {detail.tags.map((t) => <span key={t} className="role-badge role-student">{t}</span>)}
                    </div>
                  ) : null}
                </Field>
              </div>
            </div>

            <div style={card}>
              <h3 style={{ marginTop: 0 }}>In the LMS</h3>
              {lms ? (
                <div style={{ display: 'grid', gap: '0.9rem' }}>
                  <Field label="Account">{lms.name} <span className={`role-badge role-${lms.role}`}>{lms.role}</span></Field>
                  <Field label="Status"><span className={`status-dot status-${lms.status}`}>{lms.status}</span></Field>
                  {lms.role === 'student' && (
                    <Field label="Courses">{lms.courses?.length ? lms.courses.join(', ') : 'Not enrolled in any course yet'}</Field>
                  )}
                </div>
              ) : (
                <p style={muted}>No LMS account uses this email yet. Use <strong>Enroll</strong> to create a student and put them on a course.</p>
              )}

              {cust && (
                <>
                  <h3 style={{ marginTop: '1.5rem' }}>Kajabi Customer</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.9rem' }}>
                    <Field label="Customer since">{fmtDate(cust.created_at)}</Field>
                    <Field label="Last active">{fmtDateTime(cust.last_request_at)}</Field>
                    {cust.public_location && <Field label="Location">{cust.public_location}</Field>}
                    {cust.public_website && <Field label="Website">{cust.public_website}</Field>}
                    {cust.bounced_at && <Field label="Email bounced">{fmtDate(cust.bounced_at)}</Field>}
                  </div>
                  {cust.public_bio && <div style={{ marginTop: '0.9rem' }}><Field label="Bio">{cust.public_bio}</Field></div>}
                </>
              )}
            </div>
          </div>

          <div className="section">
            <h3>Products ({detail.products.length})</h3>
            {detail.products.length === 0 ? <p style={muted}>{cust ? 'No products.' : 'Not a Kajabi customer — no products.'}</p> : (
              <DataTable
                columns={[
                  { key: 'title', label: 'Product', accessor: 'title' },
                  { key: 'type', label: 'Type', accessor: 'type' },
                  { key: 'status', label: 'Status', accessor: 'status' },
                  { key: 'members', label: 'Members', accessor: 'members', render: (r) => (r.members ?? '—') },
                ]}
                data={detail.products}
                searchable={false}
              />
            )}
          </div>

          <div className="section">
            <h3>Offers ({detail.offers.length})</h3>
            {detail.offers.length === 0 ? <p style={muted}>No offers.</p> : (
              <DataTable
                columns={[
                  { key: 'title', label: 'Offer', accessor: 'title' },
                  { key: 'price', label: 'Price', accessor: 'price_in_cents', render: (r) => (r.free ? 'Free' : cents(r.price_in_cents, r.currency)) },
                  { key: 'payment_type', label: 'Payment', accessor: 'payment_type', render: (r) => r.price_description || r.payment_type || '—' },
                ]}
                data={detail.offers}
                searchable={false}
              />
            )}
          </div>

          <div className="section">
            <h3>Purchases ({detail.purchases.length})</h3>
            {detail.purchases.length === 0 ? <p style={muted}>No purchases.</p> : (
              <DataTable
                columns={[
                  { key: 'created_at', label: 'Date', accessor: 'created_at', render: (r) => fmtDate(r.created_at) },
                  { key: 'offer', label: 'Offer', accessor: 'offer_title', render: (r) => r.offer_title || '—' },
                  { key: 'amount', label: 'Amount', accessor: 'amount_in_cents', render: (r) => cents(r.amount_in_cents, r.currency) },
                  { key: 'payment_type', label: 'Payment', accessor: 'payment_type' },
                  { key: 'coupon', label: 'Coupon', accessor: 'coupon_code', render: (r) => r.coupon_code || '—' },
                  { key: 'status', label: 'Status', accessor: 'deactivated_at', render: (r) => (r.deactivated_at
                    ? <span className="status-dot status-inactive">ended {fmtDate(r.deactivated_at)}</span>
                    : <span className="status-dot status-active">active</span>) },
                ]}
                data={detail.purchases}
                searchable={false}
              />
            )}
          </div>

          <div className="section">
            <h3>Notes ({detail.notes.length})</h3>
            {detail.notes.length === 0 ? <p style={muted}>No notes.</p> : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {detail.notes.map((n) => (
                  <div key={n.id} style={card}>
                    <div style={{ ...muted, fontSize: 12, marginBottom: 4 }}>{fmtDateTime(n.created_at)}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
