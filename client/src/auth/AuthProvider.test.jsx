import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthProvider.jsx';
import { useAuth } from './useAuth.js';
import { loadToken, saveToken } from './tokenStorage.js';
import {
  getCurrentUser,
  loginUser,
  registerUser,
  setUnauthorizedHandler,
} from '../api.js';

vi.mock('../api.js', () => ({
  getCurrentUser: vi.fn(),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

const USER = { id: 1, email: 'a@example.com', createdAt: '2026-10-01T00:00:00Z' };

function Probe() {
  const { status, user, login, register, logout } = useAuth();
  const [error, setError] = useState('');

  async function run(action) {
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="email">{user ? user.email : 'nobody'}</p>
      <p data-testid="error">{error}</p>
      <button type="button" onClick={() => run(() => login('a@example.com', 'secret-pw'))}>
        log in
      </button>
      <button type="button" onClick={() => run(() => register('a@example.com', 'secret-pw'))}>
        register
      </button>
      <button type="button" onClick={logout}>
        log out
      </button>
    </div>
  );
}

function renderApp() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

const status = () => screen.getByTestId('status');

async function renderAuthenticated() {
  saveToken('stored-token');
  getCurrentUser.mockResolvedValue({ user: USER });
  renderApp();
  await waitFor(() => expect(status()).toHaveTextContent('authenticated'));
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('AuthProvider: starting up', () => {
  it('is anonymous, without calling the server, when no token is stored', () => {
    renderApp();

    expect(status()).toHaveTextContent('anonymous');
    expect(screen.getByTestId('email')).toHaveTextContent('nobody');
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('shows "checking" while a stored token is verified, then authenticated', async () => {
    saveToken('stored-token');
    let finish;
    getCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );

    renderApp();
    expect(status()).toHaveTextContent('checking');

    await act(async () => {
      finish({ user: USER });
    });

    expect(status()).toHaveTextContent('authenticated');
    expect(screen.getByTestId('email')).toHaveTextContent('a@example.com');
    expect(getCurrentUser.mock.calls[0][0]).toBe('stored-token');
  });

  it('keeps the stored token when the check fails for a network reason', async () => {
    saveToken('stored-token');
    getCurrentUser.mockRejectedValue(new Error('Could not reach the server.'));

    renderApp();
    await waitFor(() => expect(status()).toHaveTextContent('anonymous'));

    expect(loadToken()).toBe('stored-token');
  });
});

describe('AuthProvider: the unauthorized handler', () => {
  it('ends the session and clears the token when the handler runs', async () => {
    await renderAuthenticated();
    const handler = setUnauthorizedHandler.mock.calls[0][0];

    await act(async () => {
      handler();
    });

    expect(status()).toHaveTextContent('anonymous');
    expect(loadToken()).toBeNull();
  });

  it('unregisters the handler when the provider unmounts', () => {
    const { unmount } = renderApp();

    unmount();

    expect(setUnauthorizedHandler).toHaveBeenLastCalledWith(null);
  });
});

describe('AuthProvider: login, register, logout', () => {
  it('logs in: stores the token, becomes authenticated, and skips the extra check', async () => {
    loginUser.mockResolvedValue({ token: 'new-token', user: USER });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'log in' }));

    await waitFor(() => expect(status()).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('email')).toHaveTextContent('a@example.com');
    expect(loadToken()).toBe('new-token');
    expect(loginUser).toHaveBeenCalledWith('a@example.com', 'secret-pw');
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('stays anonymous and stores nothing when login fails', async () => {
    loginUser.mockRejectedValue(new Error('Invalid email or password'));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'log in' }));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('Invalid email or password')
    );
    expect(status()).toHaveTextContent('anonymous');
    expect(loadToken()).toBeNull();
  });

  it('registers, then logs in with the same credentials', async () => {
    registerUser.mockResolvedValue({ user: USER });
    loginUser.mockResolvedValue({ token: 'new-token', user: USER });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'register' }));

    await waitFor(() => expect(status()).toHaveTextContent('authenticated'));
    expect(registerUser).toHaveBeenCalledWith('a@example.com', 'secret-pw');
    expect(loginUser).toHaveBeenCalledWith('a@example.com', 'secret-pw');
    expect(registerUser.mock.invocationCallOrder[0]).toBeLessThan(
      loginUser.mock.invocationCallOrder[0]
    );
  });

  it('does not try to log in when registration fails', async () => {
    registerUser.mockRejectedValue(new Error('Email already registered'));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'register' }));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('Email already registered')
    );
    expect(loginUser).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent('anonymous');
  });

  it('logs out: clears the token and the user', async () => {
    await renderAuthenticated();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'log out' }));

    expect(status()).toHaveTextContent('anonymous');
    expect(screen.getByTestId('email')).toHaveTextContent('nobody');
    expect(loadToken()).toBeNull();
  });
});

describe('useAuth', () => {
  it('throws a clear error when used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>.');

    spy.mockRestore();
  });
});