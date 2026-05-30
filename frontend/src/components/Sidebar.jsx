import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

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
    { key: 'system', label: 'Audit Logs', icon: 'settings' },
  ],
};

const iconMap = {
  grid: '⊞', book: '📚', video: '🎥', award: '🏆', users: '👥',
  'check-square': '✅', 'dollar-sign': '💰', 'bar-chart': '📊',
  settings: '⚙️', logout: '🚪', student: '🎓', tutor: '👨‍🏫',
  layers: '📋',
};

export default function Sidebar({ activeTab, onTabChange }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = menuItems[user?.role] || [];

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

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-logo">TijusPro</h2>
      </div>

      <div className="sidebar-user">
        <div className="avatar" style={{ backgroundColor: user?.avatar_color || '#4F46E5' }}>
          {initials}
        </div>
        <div className="sidebar-user-info">
          <span className="sidebar-user-name">{user?.name}</span>
          <span className="sidebar-user-role">{user?.role}</span>
        </div>
      </div>

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
    </aside>
  );
}
