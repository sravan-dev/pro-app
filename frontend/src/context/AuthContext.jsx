import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

const CACHED_USER_KEY = 'auth:user';

function readCachedUser() {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Hydrate from the last-known user so returning visitors render the app shell
  // instantly instead of waiting on the session round-trip. checkSession then
  // revalidates in the background and corrects/clears if the session expired.
  const [user, setUserState] = useState(readCachedUser);
  const [loading, setLoading] = useState(() => !readCachedUser());

  const setUser = useCallback((u) => {
    setUserState(u);
    try {
      if (u) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(u));
      else localStorage.removeItem(CACHED_USER_KEY);
    } catch {
      /* ignore storage errors (private mode, quota) */
    }
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const data = await api.getSession();
      if (data.authenticated) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
