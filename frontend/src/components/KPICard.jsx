import React from 'react';

const iconMap = {
  users: '👥', book: '📚', video: '🎥', award: '🏆',
  'trending-up': '📈', clock: '🕐', dollar: '💰',
  'check-circle': '✅', alert: '⚠️', activity: '📊',
  layers: '📋', star: '⭐', percent: '📐', calendar: '📅',
};

export default function KPICard({ title, value, subtitle, icon, color, trend, onClick }) {
  return (
    <div className="kpi-card" style={{ borderTopColor: color || '#3B82F6', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="kpi-card-header">
        <span className="kpi-icon" style={{ backgroundColor: (color || '#3B82F6') + '15', color: color }}>
          {iconMap[icon] || '📊'}
        </span>
        {trend !== undefined && (
          <span className={`kpi-trend ${trend >= 0 ? 'positive' : 'negative'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="kpi-card-body">
        <h3 className="kpi-value">{value}</h3>
        <p className="kpi-title">{title}</p>
        {subtitle && <p className="kpi-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}
