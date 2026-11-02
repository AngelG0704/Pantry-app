import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AccountPage from './AccountPage.jsx';
import { useAuth } from '../auth/useAuth.js';

vi.mock('../auth/useAuth.js', () => ({ useAuth: vi.fn() }));

// The shape GET /api/auth/me returns (pinned by auth.test.js on the server).
const USER = {
  id: 1,
  email: 'racc@example.com',
  createdAt: '2026-10-01T12:00:00.000Z',
};

describe('AccountPage', () => {
  it('shows the account email', () => {
    useAuth.mockReturnValue({ user: USER });

    render(<AccountPage />);

    expect(screen.getByText('Email').nextElementSibling).toHaveTextContent('racc@example.com');
  });

  it('shows a real member-since date, never "Invalid Date"', () => {
    useAuth.mockReturnValue({ user: USER });

    render(<AccountPage />);

    const expected = new Date(USER.createdAt).toLocaleDateString();
    const value = screen.getByText('Member since').nextElementSibling;
    expect(value).toHaveTextContent(expected);
    expect(value).not.toHaveTextContent('Invalid Date');
  });
});