import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import LoginPage from './LoginPage.jsx';
import { useAuth } from '../auth/useAuth.js';

vi.mock('../auth/useAuth.js', () => ({ useAuth: vi.fn() }));

function renderLogin({ auth, state } = {}) {
  useAuth.mockReturnValue({ status: 'anonymous', login: vi.fn(), ...auth });

  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pantry" element={<p>pantry page</p>} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function serverError(message, { status = 400, details } = {}) {
  return Object.assign(new Error(message), { status, details });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('LoginPage', () => {
  it('returns an authenticated user to the page they came from', () => {
    renderLogin({ auth: { status: 'authenticated' }, state: { from: '/pantry' } });

    expect(screen.getByText('pantry page')).toBeInTheDocument();
  });

  it('sends an authenticated user home when there is no page to return to', () => {
    renderLogin({ auth: { status: 'authenticated' } });

    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('submits exactly what was typed', async () => {
    const login = vi.fn().mockResolvedValue();
    const user = userEvent.setup();
    renderLogin({ auth: { login } });

    await user.type(screen.getByLabelText('Email'), 'a@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret-pw');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(login).toHaveBeenCalledWith('a@example.com', 'secret-pw');
  });

  it('shows each server message beside its own field', async () => {
    const login = vi.fn().mockRejectedValue(
      serverError('email is required', {
        details: [
          { field: 'email', message: 'email is required' },
          { field: 'password', message: 'password is required' },
        ],
      })
    );
    const user = userEvent.setup();
    renderLogin({ auth: { login } });

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('password is required')).toBeInTheDocument();
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('email is required');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('shows a general error as an alert when the server gives no field details', async () => {
    const login = vi.fn().mockRejectedValue(
      serverError('Invalid email or password', { status: 401 })
    );
    const user = userEvent.setup();
    renderLogin({ auth: { login } });

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('disables the button and changes its label while the request is running', async () => {
    const login = vi.fn(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderLogin({ auth: { login } });

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('button', { name: 'Logging in…' })).toBeDisabled();
  });
});