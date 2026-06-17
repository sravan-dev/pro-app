import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const menuItems = {
  student: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'courses', label: 'My Courses', icon: 'book' },
    { key: 'sessions', label: 'Sessions', icon: 'video' },
    { key: 'booktutor', label: 'Book a Tutor', icon: 'clock' },
    { key: 'myteam', label: 'My Team', icon: 'star' },
    { key: 'grades', label: 'Grades', icon: 'award' },
  ],
  tutor: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'students', label: 'Students', icon: 'users' },
    { key: 'sessions', label: 'Sessions', icon: 'video' },
    { key: 'availability', label: 'My Availability', icon: 'clock' },
    { key: 'attendance', label: 'Attendance', icon: 'check-square' },
    { key: 'recordings', label: 'Recordings', icon: 'film' },
    { key: 'payouts', label: 'Payouts', icon: 'dollar-sign' },
  ],
  advisor: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'students', label: 'Students', icon: 'users' },
    { key: 'enrolls', label: 'Enrolls', icon: 'layers' },
    { key: 'reports', label: 'Reports', icon: 'bar-chart' },
  ],
  manager: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'teams', label: 'Team Performance', icon: 'users' },
    { key: 'myteam', label: 'My Team', icon: 'users' },
    { key: 'ratings', label: 'Ratings', icon: 'star' },
    { key: 'enrolls', label: 'Enrolls', icon: 'layers' },
    { key: 'reports', label: 'Reports', icon: 'bar-chart' },
  ],
  superadmin: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'contacts', label: 'Contacts', icon: 'contact' },
    { key: 'students', label: 'Students', icon: 'student' },
    { key: 'tutors', label: 'Tutors', icon: 'tutor' },
    { key: 'users', label: 'All Users', icon: 'users' },
    { key: 'courses', label: 'Courses', icon: 'book' },
    { key: 'teams', label: 'Teams', icon: 'users' },
    { key: 'ratings', label: 'Ratings', icon: 'star' },
    { key: 'enrollments', label: 'Enrollments', icon: 'layers' },
    { key: 'meetings', label: 'Meetings', icon: 'link' },
    { key: 'sessions', label: 'Sessions', icon: 'video' },
    { key: 'timeslots', label: 'Time Slots', icon: 'clock' },
    { key: 'attendance', label: 'Attendance', icon: 'check-square' },
    { key: 'reports', label: 'Reports', icon: 'bar-chart' },
    { key: 'system', label: 'Audit Logs', icon: 'clipboard' },
    { key: 'integrations', label: 'Integrations', icon: 'plug' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ],
};

// Monochrome line icons (Feather-style). They inherit the sidebar text color
// via stroke="currentColor", so every icon renders single-color white.
const Svg = ({ children }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const iconMap = {
  grid: <Svg><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></Svg>,
  book: <Svg><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Svg>,
  video: <Svg><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></Svg>,
  award: <Svg><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></Svg>,
  users: <Svg><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Svg>,
  'check-square': <Svg><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Svg>,
  'dollar-sign': <Svg><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Svg>,
  'bar-chart': <Svg><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></Svg>,
  settings: <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>,
  student: <Svg><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></Svg>,
  tutor: <Svg><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></Svg>,
  layers: <Svg><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></Svg>,
  clipboard: <Svg><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></Svg>,
  film: <Svg><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></Svg>,
  contact: <Svg><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><circle cx="12" cy="9" r="2" /><path d="M9 14c.5-1.5 1.6-2 3-2s2.5.5 3 2" /></Svg>,
  plug: <Svg><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0z" /><path d="M12 17v5" /></Svg>,
  link: <Svg><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Svg>,
  clock: <Svg><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Svg>,
  star: <Svg><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Svg>,
};

export default function Sidebar({ activeTab, onTabChange }) {
  const { user, logout, checkSession } = useAuth();
  const navigate = useNavigate();
  const items = menuItems[user?.role] || [];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Max size 5 MB.'); return; }
    setError('');
    setUploading(true);
    try {
      await api.uploadAvatar(file);
      await checkSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const onRemove = async () => {
    if (!confirm('Remove profile picture?')) return;
    setUploading(true);
    setError('');
    try {
      await api.removeAvatar();
      await checkSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Mobile-only top bar with the hamburger toggle. */}
      <div className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {mobileOpen
              ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              : <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
        <img src="/logo.png" alt="Tiju's Academy" className="mobile-topbar-logo" />
      </div>

      {/* Backdrop closes the drawer when tapped (mobile only). */}
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <img src="/logo.png" alt="Tiju's Academy" className="sidebar-logo" />
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.key}
            className={`sidebar-item ${activeTab === item.key ? 'active' : ''}`}
            onClick={() => { onTabChange(item.key); setMobileOpen(false); }}
          >
            <span className="sidebar-icon">{iconMap[item.icon] || <Svg><circle cx="12" cy="12" r="3" /></Svg>}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {user?.role && (
          <span className="sidebar-subtitle">{user.role[0].toUpperCase() + user.role.slice(1)} portal</span>
        )}
        <div className="sidebar-userbar">
          <button
            type="button"
            className="sidebar-user-card"
            onClick={() => setShowProfile(true)}
            title="Update profile picture"
          >
            <div
              className="avatar"
              style={{
                width: '38px', height: '38px', fontSize: '14px', flexShrink: 0,
                backgroundColor: user?.avatar_color || '#4F46E5',
                backgroundImage: user?.avatar_url ? `url(${user.avatar_url})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: user?.avatar_url ? 'transparent' : undefined,
              }}
            >
              {!user?.avatar_url && initials}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user?.name}</span>
              <span className="sidebar-user-email">{user?.email}</span>
            </div>
          </button>
          <button type="button" className="sidebar-gear" onClick={handleLogout} title="Logout" aria-label="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {showProfile && (
        <div className="modal-overlay" onClick={() => setShowProfile(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
            <h3>Update Profile Picture</h3>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  backgroundColor: user?.avatar_color || '#4F46E5',
                  backgroundImage: user?.avatar_url ? `url(${user.avatar_url})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '36px',
                  fontWeight: 600,
                }}
              >
                {!user?.avatar_url && initials}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600 }}>{user?.name}</div>
                <div style={{ color: '#888', fontSize: '13px' }}>{user?.email}</div>
              </div>
              {error && <div style={{ color: '#dc2626', fontSize: '13px' }}>{error}</div>}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                onChange={onPickFile}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? 'Uploading...' : (user?.avatar_url ? 'Replace Photo' : 'Upload Photo')}
                </button>
                {user?.avatar_url && (
                  <button type="button" className="btn btn-ghost" disabled={uploading} onClick={onRemove} style={{ color: '#dc2626' }}>
                    Remove
                  </button>
                )}
              </div>
              <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', margin: 0 }}>JPG, PNG, GIF, WEBP. Max 5 MB.</p>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowProfile(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </aside>
    </>
  );
}
