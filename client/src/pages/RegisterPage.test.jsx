import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import RegisterPage from './RegisterPage.jsx';
import { useAuth } from '../auth/useAuth.js';

vi.mock('../auth/useAuth.js', () => ({ useAuth: vi.fn() }));

const EMAIL = 'Email';
const PASSWORD = 'Password (at least 8 characters)';

function LoginStub() {
  const location = useLocation();
  return <p>login page, from {location.state?.from ?? 'nowhere'}</p>;
}

function renderRegister({ auth, state } = {}) {
  useAuth.mockReturnValue({ status: 'anonymous', register: vi.fn(), ...auth });

  render(
    <MemoryRouter initialEntries={[{ pathname: '/register', state }]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginStub />} />
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

describe('RegisterPage: redirects', () => {
  it('returns an authenticated user to the page they came from', () => {
    renderRegister({ auth: { status: 'authenticated' }, state: { from: '/pantry' } });

    expect(screen.getByText('pantry page')).toBeInTheDocument();
  });

  it('sends an authenticated user home when there is no page to return to', () => {
    renderRegister({ auth: { status: 'authenticated' } });

    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('keeps the original destination when the visitor switches to the login page', async () => {
    const user = userEvent.setup();
    renderRegister({ state: { from: '/pantry' } });

    await user.click(screen.getByRole('link', { name: 'Log in' }));

    expect(screen.getByText('login page, from /pantry')).toBeInTheDocument();
  });
});

describe('RegisterPage: the form', () => {
  it('asks for an email and a new password, with the right input types', () => {
    renderRegister();

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
    const email = screen.getByLabelText(EMAIL);
    const password = screen.getByLabelText(PASSWORD);
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
  });

  it('submits exactly what was typed', async () => {
    const register = vi.fn().mockResolvedValue();
    const user = userEvent.setup();
    renderRegister({ auth: { register } });

    await user.type(screen.getByLabelText(EMAIL), 'a@example.com');
    await user.type(screen.getByLabelText(PASSWORD), 'secret-pw-1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('a@example.com', 'secret-pw-1');
  });

  it('leaves validation to the server: an empty form is still submitted', async () => {
    const register = vi.fn().mockResolvedValue();
    const user = userEvent.setup();
    renderRegister({ auth: { register } });

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(register).toHaveBeenCalledWith('', '');
  });

  it('shows each server message beside its own field', async () => {
    const register = vi.fn().mockRejectedValue(
      serverError('A valid email is required', {
        details: [
          { field: 'email', message: 'A valid email is required' },
          { field: 'password', message: 'Password must be at least 8 characters' },
        ],
      })
    );
    const user = userEvent.setup();
    renderRegister({ auth: { register } });

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    const email = screen.getByLabelText(EMAIL);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('A valid email is required');
    expect(screen.getByLabelText(PASSWORD)).toHaveAccessibleDescription(
      'Password must be at least 8 characters'
    );
  });

  it('shows a general error as an alert when the server gives no field details', async () => {
    const register = vi.fn().mockRejectedValue(
      serverError('Email already registered', { status: 409 })
    );
    const user = userEvent.setup();
    renderRegister({ auth: { register } });

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered');
  });

  it('clears the old errors when the form is submitted again', async () => {
    const register = vi
      .fn()
      .mockRejectedValueOnce(serverError('Email already registered', { status: 409 }))
      .mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    renderRegister({ auth: { register } });

    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables the button and changes its label while the request is running', async () => {
    const register = vi.fn(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderRegister({ auth: { register } });

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled();
  });

  it('enables the button again after a failure so the user can retry', async () => {
    const register = vi.fn().mockRejectedValue(serverError('Something went wrong.', { status: 500 }));
    const user = userEvent.setup();
    renderRegister({ auth: { register } });

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });
});