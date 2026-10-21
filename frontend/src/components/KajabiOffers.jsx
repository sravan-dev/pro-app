import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import DataTable from './DataTable';
import { Skeleton } from './Skeleton';
import { formatMoney } from '../utils/money';

// Packages → Kajabi offers: the offers from Kajabi's Sales → Pricing page,
// read-only. Money is shown in the app's currency (Settings), like the Kajabi
// contact page — amounts are displayed as-is.
const muted = { color: 'var(--color-text-secondary)' };
const PAYMENT_TYPES = { single: 'One-time', multipay: 'Payment plan', subscription: 'Subscription', free: 'Free' };

const price = (o, currency) => {
  if (o.free) return 'Free';
  if (o.price_in_cents == null) return o.price_description || '—';
  return formatMoney(o.price_in_cents / 100, currency);
};

export default function KajabiOffers({ currency }) {
  const [offers, setOffers] = useState(null); // null while loading
  const [error, setError] = useState('');
  const [syncedAt, setSyncedAt] = useState(null);

  // Offers come from the server's cache; Refresh pulls a fresh copy from Kajabi.
  const load = useCallback((refresh = false) => {
    setOffers(null); setError('');
    api.getKajabiOffers(refresh)
      .then((d) => { setOffers(d.offers || []); setSyncedAt(d.synced_at); })
      .catch((err) => { setError(err.message || 'Could not load Kajabi offers'); setOffers([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: 'title', label: 'Offer', accessor: 'title', render: (o) => (
      <div className="kj-offer">
        {o.image_url
          ? <img src={o.image_url} alt="" className="kj-offer-img" loading="lazy" />
          : <span className="kj-offer-img kj-offer-img-empty" aria-hidden="true">🖼</span>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{o.title}</div>
          {o.internal_title && o.internal_title !== o.title && <div style={{ ...muted, fontSize: '0.82em' }}>{o.internal_title}</div>}
        </div>
      </div>
    ) },
    { key: 'products', label: 'Products', accessor: (o) => o.products.join(', '), render: (o) => (o.products.length ? o.products.join(', ') : <span style={muted}>—</span>) },
    { key: 'type', label: 'Payment', accessor: 'payment_type', render: (o) => PAYMENT_TYPES[o.payment_type] || o.payment_type || '—' },
    { key: 'price', label: 'Price', accessor: (o) => Number(o.price_in_cents) || 0, render: (o) => (
      <div style={{ whiteSpace: 'nowrap' }}>
        <strong>{price(o, currency)}</strong>
        {o.price_description && o.price_in_cents != null && <div style={{ ...muted, fontSize: '0.82em', whiteSpace: 'normal' }}>{o.price_description}</div>}
      </div>
    ) },
    { key: 'actions', label: '', sortable: false, render: (o) => (o.checkout_url
      ? <a className="btn btn-sm btn-ghost" href={o.checkout_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Checkout ↗</a>
      : null) },
  ];

  return (
    <div>
      <p style={{ ...muted, marginTop: '-0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        Offers from Kajabi (Sales → Pricing). Read-only — edit them in Kajabi.
        {syncedAt && <span>Last synced {new Date(syncedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => load(true)} disabled={offers === null}>↻ Sync from Kajabi</button>
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {offers === null ? (
        <div className="data-table-container" style={{ padding: '1rem' }} aria-busy="true" aria-label="Loading Kajabi offers">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="kj-offer" style={{ padding: '0.6rem 0' }}>
              <Skeleton width={84} height={48} radius={6} />
              <div style={{ flex: 1 }}>
                <Skeleton width="45%" height={14} />
                <Skeleton width="25%" height={11} style={{ marginTop: 8 }} />
              </div>
              <Skeleton width={90} height={14} />
            </div>
          ))}
        </div>
      ) : offers.length === 0 ? (
        !error && <p className="empty-state">No offers found in Kajabi.</p>
      ) : (
        <DataTable columns={columns} data={offers} pageSize={20} />
      )}
    </div>
  );
}
