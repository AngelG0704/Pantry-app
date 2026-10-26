import { useEffect, useState } from 'react';
import { AuthContext } from './AuthContext.js';
import { clearToken, loadToken, saveToken } from './tokenStorage.js';
import {
  getCurrentUser,
  loginUser,
  registerUser,
  setUnauthorizedHandler,
} from '../api.js';

const ANONYMOUS = { status: 'anonymous', token: null, user: null };

function initialSession() {
  const token = loadToken();
  return token ? { status: 'checking', token, user: null } : ANONYMOUS;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(initialSession);

  // Any request that carried a token and got a 401 ends the session.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setSession(ANONYMOUS);
    });

    return () => setUnauthorizedHandler(null);
  }, []);

  // A stored token must be verified with the server before we trust it.
  useEffect(() => {
    if (session.status !== 'checking') {
      return undefined;
    }

    const controller = new AbortController();

    getCurrentUser(session.token, controller.signal)
      .then(({ user }) => {
        setSession({ status: 'authenticated', token: session.token, user });
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          return;
        }
        setSession(ANONYMOUS);
      });

    return () => controller.abort();
  }, [session.status, session.token]);

  async function login(email, password) {
    const { token, user } = await loginUser(email, password);
    saveToken(token);
    setSession({ status: 'authenticated', token, user });
  }

  async function register(email, password) {
    await registerUser(email, password);
    await login(email, password);
  }

  function logout() {
    clearToken();
    setSession(ANONYMOUS);
  }

  const value = { ...session, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}