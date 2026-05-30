import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import PasswordReset from './components/PasswordReset';
import CallPage from './components/CallPage';
import ProtectedRoute from './components/ProtectedRoute';
import StudentPortal from './portals/StudentPortal';
import TutorPortal from './portals/TutorPortal';
import AdvisorPortal from './portals/AdvisorPortal';
import ManagerPortal from './portals/ManagerPortal';
import SuperadminPortal from './portals/SuperadminPortal';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading TijusPro...</p></div>;
  }

  const getDefaultRoute = () => {
    if (!user) return '/login';
    const routes = { student: '/student', tutor: '/tutor', advisor: '/advisor', manager: '/manager', superadmin: '/admin' };
    return routes[user.role] || '/login';
  };

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={getDefaultRoute()} replace /> : <Login />} />
      <Route path="/reset-password" element={<PasswordReset />} />
      <Route path="/call/:sessionId" element={<CallPage />} />

      <Route path="/student/*" element={<ProtectedRoute roles={['student']}><StudentPortal /></ProtectedRoute>} />
      <Route path="/tutor/*" element={<ProtectedRoute roles={['tutor']}><TutorPortal /></ProtectedRoute>} />
      <Route path="/advisor/*" element={<ProtectedRoute roles={['advisor']}><AdvisorPortal /></ProtectedRoute>} />
      <Route path="/manager/*" element={<ProtectedRoute roles={['manager']}><ManagerPortal /></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute roles={['superadmin']}><SuperadminPortal /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
