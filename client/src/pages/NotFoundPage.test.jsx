import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import NotFoundPage from './NotFoundPage.jsx';

describe('NotFoundPage', () => {
  it('says the page is missing and links back to the pantry', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Page not found' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go back to the pantry' })
    ).toHaveAttribute('href', '/');
  });
});