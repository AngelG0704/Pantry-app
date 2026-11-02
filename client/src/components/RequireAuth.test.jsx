import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import RequireAuth from './RequireAuth.jsx';
import { useAuth } from '../auth/useAuth.js';

vi.mock('../auth/useAuth.js', () => ({ useAuth: vi.fn() }));

function LoginStub() {
  const location = useLocation();
  return <p>login page, from {location.state?.from}</p>;
}

function renderProtected() {
  render(
    <MemoryRouter initialEntries={['/pantry']}>
      <Routes>
        <Route
          path="/pantry"
          element={
            <RequireAuth>
              <p>secret pantry</p>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginStub />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RequireAuth', () => {
  it('shows a waiting message, not the page and not the login screen, while checking', () => {
    useAuth.mockReturnValue({ status: 'checking' });

    renderProtected();

    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(screen.queryByText('secret pantry')).not.toBeInTheDocument();
    expect(screen.queryByText(/login page/)).not.toBeInTheDocument();
  });

  it('sends an anonymous visitor to the login page, remembering where they were', () => {
    useAuth.mockReturnValue({ status: 'anonymous' });

    renderProtected();

    expect(screen.getByText('login page, from /pantry')).toBeInTheDocument();
    expect(screen.queryByText('secret pantry')).not.toBeInTheDocument();
  });

  it('shows the page to an authenticated user', () => {
    useAuth.mockReturnValue({ status: 'authenticated' });

    renderProtected();

    expect(screen.getByText('secret pantry')).toBeInTheDocument();
  });
});