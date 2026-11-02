import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import RecipePage from './RecipePage.jsx';
import { getPantry, getRecipe } from '../api.js';
import { useAuth } from '../auth/useAuth.js';

vi.mock('../api.js', () => ({ getRecipe: vi.fn(), getPantry: vi.fn() }));
vi.mock('../auth/useAuth.js', () => ({ useAuth: vi.fn() }));

// The shape GET /api/recipes/:id returns (pinned by catalog.test.js on the server).
const RECIPE = {
  id: 2,
  title: 'Grilled cheese',
  instructions: 'Butter the bread.\nAdd cheese and toast.',
  prepMinutes: 10,
  ingredients: ['bread', 'butter', 'cheese'],
};

function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

function renderRecipe({ selected = [], token = null } = {}) {
  useAuth.mockReturnValue({ token });

  render(
    <MemoryRouter initialEntries={['/recipes/2']}>
      <Routes>
        <Route path="/recipes/:id" element={<RecipePage search={{ selected }} />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const items = () => screen.getAllByRole('listitem').map((li) => li.textContent);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RecipePage: loading and showing a recipe', () => {
  it('shows a loading message while the recipe is on its way', () => {
    getRecipe.mockReturnValue(new Promise(() => {}));

    renderRecipe();

    expect(screen.getByText('Loading recipe…')).toBeInTheDocument();
  });

  it('shows the title, prep time, ingredients, and instructions', async () => {
    getRecipe.mockResolvedValue(RECIPE);

    renderRecipe();

    expect(await screen.findByRole('heading', { name: 'Grilled cheese' })).toBeInTheDocument();
    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.getByText(/Butter the bread/)).toBeInTheDocument();
    // With nothing selected and nobody logged in, there are no marks.
    expect(items()).toEqual(['bread', 'butter', 'cheese']);
    expect(getRecipe).toHaveBeenCalledWith('2', expect.any(AbortSignal));
  });

  it('leaves out the prep time when the recipe has none', async () => {
    getRecipe.mockResolvedValue({ ...RECIPE, prepMinutes: null });

    renderRecipe();

    await screen.findByRole('heading', { name: 'Grilled cheese' });
    expect(screen.queryByText(/minutes/)).not.toBeInTheDocument();
  });

  it('shows instructions as plain text, never as HTML', async () => {
    const sneaky = '<b>bold</b> and <img src=x onerror=alert(1)>';
    getRecipe.mockResolvedValue({ ...RECIPE, instructions: sneaky });

    renderRecipe();

    expect(await screen.findByText(sneaky)).toBeInTheDocument();
    expect(document.querySelector('.instructions b')).toBeNull();
    expect(document.querySelector('.instructions img')).toBeNull();
  });
});

describe('RecipePage: "you have this" marks', () => {
  it('marks ingredients from the typed selection when logged out, without asking for a pantry', async () => {
    getRecipe.mockResolvedValue(RECIPE);

    renderRecipe({ selected: [{ id: 1, name: 'bread' }] });

    await screen.findByRole('heading', { name: 'Grilled cheese' });
    expect(items()).toEqual([
      'bread ✓ you have this',
      'butter — you need this',
      'cheese — you need this',
    ]);
    expect(getPantry).not.toHaveBeenCalled();
  });

  it('prefers the saved pantry over the typed selection when logged in', async () => {
    getRecipe.mockResolvedValue(RECIPE);
    getPantry.mockResolvedValue([{ id: 2, name: 'butter' }]);

    renderRecipe({ selected: [{ id: 1, name: 'bread' }], token: 'tok' });

    await waitFor(() =>
      expect(items()).toEqual([
        'bread — you need this',
        'butter ✓ you have this',
        'cheese — you need this',
      ])
    );
    expect(getPantry).toHaveBeenCalledWith('tok', expect.any(AbortSignal));
  });

  it('still works, using the typed selection, when the pantry lookup fails', async () => {
    getRecipe.mockResolvedValue(RECIPE);
    getPantry.mockRejectedValue(new Error('Could not reach the server.'));

    renderRecipe({ selected: [{ id: 1, name: 'bread' }], token: 'tok' });

    await screen.findByRole('heading', { name: 'Grilled cheese' });
    expect(getPantry).toHaveBeenCalled();
    expect(items()).toEqual([
      'bread ✓ you have this',
      'butter — you need this',
      'cheese — you need this',
    ]);
  });
});

describe('RecipePage: errors', () => {
  for (const status of [404, 400]) {
    it(`says the recipe cannot be found for a ${status}, with no retry button`, async () => {
      getRecipe.mockRejectedValue(apiError('Recipe not found', status));

      renderRecipe();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "We couldn't find that recipe."
      );
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Back to your ingredients/ })
      ).toHaveAttribute('href', '/');
    });
  }

  it('shows the server error with a retry button, and retrying loads the recipe', async () => {
    getRecipe
      .mockRejectedValueOnce(apiError('Something went wrong.', 500))
      .mockResolvedValueOnce(RECIPE);
    const user = userEvent.setup();

    renderRecipe();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the recipe: Something went wrong.'
    );

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Grilled cheese' })).toBeInTheDocument();
    expect(getRecipe).toHaveBeenCalledTimes(2);
  });
});