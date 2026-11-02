import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import SiteHeader from './SiteHeader.jsx';
import { useAuth } from '../auth/useAuth.js';

vi.mock('../auth/useAuth.js', () => ({ useAuth: vi.fn() }));

function renderHeader(auth) {
  useAuth.mockReturnValue(auth);

  render(
    <MemoryRouter initialEntries={['/pantry']}>
      <Routes>
        <Route path="/" element={<><SiteHeader /><p>home page</p></>} />
        <Route path="/pantry" element={<><SiteHeader /><p>pantry page</p></>} />
      </Routes>
    </MemoryRouter>
  );
}

const USER = { email: 'racc@example.com' };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SiteHeader', () => {
  it('shows pantry, account, and log out for an authenticated user', () => {
    renderHeader({ status: 'authenticated', user: USER, logout: vi.fn() });

    expect(screen.getByRole('link', { name: 'My pantry' })).toHaveAttribute('href', '/pantry');
    expect(screen.getByRole('link', { name: 'racc@example.com' })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('shows log in and register for an anonymous visitor', () => {
    renderHeader({ status: 'anonymous', user: null, logout: vi.fn() });

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('link', { name: 'My pantry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('shows neither set of links while the session is being checked', () => {
    renderHeader({ status: 'checking', user: null, logout: vi.fn() });

    expect(screen.getByRole('link', { name: 'Pantry App' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My pantry' })).not.toBeInTheDocument();
  });

  it('logs out and returns to the home page', async () => {
    const logout = vi.fn();
    const user = userEvent.setup();
    renderHeader({ status: 'authenticated', user: USER, logout });
    expect(screen.getByText('pantry page')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText('home page')).toBeInTheDocument();
    expect(screen.queryByText('pantry page')).not.toBeInTheDocument();
  });
});