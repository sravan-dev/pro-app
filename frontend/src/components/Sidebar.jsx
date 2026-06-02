import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const menuItems = {
  student: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'courses', label: 'My Courses', icon: 'book' },
    { key: 'sessions', label: 'Sessions', icon: 'video' },
    { key: 'grades', label: 'Grades', icon: 'award' },
  ],
  tutor: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'students', label: 'Students', icon: 'users' },
    { key: 'sessions', label: 'Sessions', icon: 'video' },
    { key: 'attendance', label: 'Attendance', icon: 'check-square' },
    { key: 'recordings', label: 'Recordings', icon: 'film' },
    { key: 'payouts', label: 'Payouts', icon: 'dollar-sign' },
  ],
  advisor: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'students', label: 'Students', icon: 'users' },
    { key: 'reports', label: 'Reports', icon: 'bar-chart' },
  ],
  manager: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'teams', label: 'Teams', icon: 'users' },
    { key: 'reports', label: 'Reports', icon: 'bar-chart' },
  ],
  superadmin: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'students', label: 'Students', icon: 'student' },
    { key: 'tutors', label: 'Tutors', icon: 'tutor' },
    { key: 'users', label: 'All Users', icon: 'users' },
    { key: 'courses', label: 'Courses', icon: 'book' },
    { key: 'enrollments', label: 'Enrollments', icon: 'layers' },
    { key: 'sessions', label: 'Sessions', icon: 'video' },
    { key: 'attendance', label: 'Attendance', icon: 'check-square' },
    { key: 'reports', label: 'Reports', icon: 'bar-chart' },
    { key: 'system', label: 'Audit Logs', icon: 'clipboard' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ],
};

const iconMap = {
  grid: '⊞', book: '📚', video: '🎥', award: '🏆', users: '👥',
  'check-square': '✅', 'dollar-sign': '💰', 'bar-chart': '📊',
  settings: '⚙️', logout: '🚪', student: '🎓', tutor: '👨‍🏫',
  layers: '📋', clipboard: '📝', film: '🎬',
};

export default function Sidebar({ activeTab, onTabChange }) {
  const { user, logout, checkSession } = useAuth();
  const navigate = useNavigate();
  const items = menuItems[user?.role] || [];
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
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/logo.png" alt="Tiju's Academy" className="sidebar-logo" />
      </div>

      <button
        type="button"
        className="sidebar-user"
        onClick={() => setShowProfile(true)}
        style={{ background: 'transparent', border: 'none', textAlign: 'center', cursor: 'pointer', padding: 0, width: '100%' }}
        title="Update profile picture"
      >
        <div
          className="avatar"
          style={{
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
          <span className="sidebar-user-role">{user?.role}</span>
        </div>
      </button>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.key}
            className={`sidebar-item ${activeTab === item.key ? 'active' : ''}`}
            onClick={() => onTabChange(item.key)}
          >
            <span className="sidebar-icon">{iconMap[item.icon] || '•'}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-item logout-btn" onClick={handleLogout}>
          <span className="sidebar-icon">{iconMap.logout}</span>
          <span className="sidebar-label">Logout</span>
        </button>
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
  );
}
