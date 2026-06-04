import React from 'react';

// Base shimmer block. Sizes/shape are driven by props so callers can compose
// any layout (cards, table rows, avatars, text lines).
export function Skeleton({ width = '100%', height = 16, radius = 8, style = {}, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius, display: 'block', ...style }}
    />
  );
}

// Placeholder for the data-dependent main area of a portal. The real Sidebar
// renders alongside this (it needs no network), so only the content shimmers.
export function MainSkeleton({ kpis = 6, rows = 8 }) {
  return (
    <div className="portal-page skeleton-page" aria-busy="true" aria-label="Loading">
      <Skeleton width="220px" height={28} style={{ marginBottom: '1.5rem' }} />

      <div className="kpi-grid">
        {Array.from({ length: kpis }).map((_, i) => (
          <div key={i} className="kpi-card skeleton-kpi">
            <Skeleton width={40} height={40} radius={10} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skeleton width="60%" height={12} />
              <Skeleton width="40%" height={20} />
            </div>
          </div>
        ))}
      </div>

      <div className="skeleton-table" style={{ marginTop: '1.5rem' }}>
        <div className="skeleton-table-head">
          <Skeleton width="180px" height={20} />
          <Skeleton width="120px" height={20} />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton-table-row">
            <Skeleton width={32} height={32} radius="50%" />
            <Skeleton width="22%" height={14} />
            <Skeleton width="28%" height={14} />
            <Skeleton width="15%" height={14} />
            <Skeleton width="12%" height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Full-page placeholder used before we know the user/role (e.g. during the
// initial auth check), so we render a sidebar shell too.
export function AppShellSkeleton() {
  return (
    <div className="portal-layout">
      <aside className="sidebar skeleton-sidebar" aria-hidden="true">
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Skeleton width={36} height={36} radius={8} />
          <Skeleton width="60%" height={14} />
        </div>
        <nav className="sidebar-nav" style={{ padding: '12px 10px' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={34} radius={8} style={{ marginBottom: 8 }} />
          ))}
        </nav>
      </aside>
      <main className="portal-content">
        <MainSkeleton />
      </main>
    </div>
  );
}

export default Skeleton;
