import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    const portalRoutes = {
      student: '/student',
      tutor: '/tutor',
      advisor: '/advisor',
      manager: '/manager',
      superadmin: '/admin',
    };
    return <Navigate to={portalRoutes[user.role] || '/login'} replace />;
  }

  return children;
}
