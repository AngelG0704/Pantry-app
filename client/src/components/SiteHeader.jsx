import { Link, NavLink, useNavigate } from 'react-router';
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
            <NavLink to="/pantry">My pantry</NavLink>
            <NavLink to="/account" className="site-header-email" >
            {user.email}
            </NavLink>
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </>
        )}

        {status === 'anonymous' && (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/register">Register</NavLink>
          </>
        )}
      </nav>
    </header>
  );
}

export default SiteHeader;