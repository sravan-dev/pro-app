import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AppShellSkeleton } from './Skeleton';

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();

  // Only block on the very first load with no cached user. Returning users are
  // hydrated from localStorage, so they fall straight through to their portal.
  if (loading && !user) {
    return <AppShellSkeleton />;
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
