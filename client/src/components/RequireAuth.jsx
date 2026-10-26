import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth.js';

function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return <p>Checking your session…</p>;
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export default RequireAuth;