import React from 'react';

const iconMap = {
  users: '👥', book: '📚', video: '🎥', award: '🏆',
  'trending-up': '📈', clock: '🕐', dollar: '💰',
  'check-circle': '✅', alert: '⚠️', activity: '📊',
  layers: '📋', star: '⭐', percent: '📐', calendar: '📅',
  contact: '📇',
};

export default function KPICard({ title, value, subtitle, icon, color, trend, onClick, variant }) {
  // AdminLTE-style "small box": solid colored card, big number, a large faint
  // icon in the corner, and a "More info" footer link.
  if (variant === 'small-box') {
    return (
      <div className="kpi-smallbox" style={{ background: color || '#3B82F6', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
        <div className="kpi-smallbox-body">
          <h3 className="kpi-smallbox-value">{value}</h3>
          <p className="kpi-smallbox-title">{title}</p>
          {subtitle && <p className="kpi-smallbox-subtitle">{subtitle}</p>}
        </div>
        <span className="kpi-smallbox-icon">{iconMap[icon] || '📊'}</span>
        <div className="kpi-smallbox-footer">
          More info <span style={{ fontSize: '0.85em' }}>🔗</span>
        </div>
      </div>
    );
  }

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
