import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth.js';

function SiteHeader() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="site-header">
      <h1>
        <Link to="/">Pantry App</Link>
      </h1>

      <nav aria-label="Account">
        {status === 'authenticated' && (
          <>
                      <Link to="/pantry">My pantry</Link>
            <Link to="/account">{user.email}</Link>
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </>
        )}

        {status === 'anonymous' && (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export default SiteHeader;