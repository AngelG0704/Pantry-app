import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import PantryPage from './PantryPage.jsx';
import { useAuth } from '../auth/useAuth.js';
import { addToPantry, getMyMatches, getPantry, removeFromPantry } from '../api.js';

vi.mock('../api.js', () => ({
  getPantry: vi.fn(),
  addToPantry: vi.fn(),
  removeFromPantry: vi.fn(),
  getMyMatches: vi.fn(),
}));
vi.mock('../auth/useAuth.js', () => ({ useAuth: vi.fn() }));

const EGG = { id: 1, name: 'egg' };
const BUTTER = { id: 2, name: 'butter' };
const BREAD = { id: 3, name: 'bread' };
const CATALOG = [EGG, BUTTER, BREAD];

// The shape GET /api/pantry/matches returns (pinned by pantry.test.js on the server).
const TOAST = {
  id: 7,
  title: 'Buttered toast',
  prepMinutes: 5,
  matchedCount: 2,
  totalCount: 3,
  matchScore: 0.67,
  missingIngredients: ['salt'],
};

function apiError(message, status = 500) {
  return Object.assign(new Error(message), { status });
}

function catalogState(overrides = {}) {
  return { status: 'success', data: CATALOG, error: '', retry: vi.fn(), ...overrides };
}

function renderPantry({ catalog = catalogState() } = {}) {
  render(
    <MemoryRouter>
      <PantryPage search={{ catalog }} />
    </MemoryRouter>
  );
}

// The chips under "In your pantry", as plain text: 'egg×'.
const chips = () =>
  within(screen.getByRole('list', { name: 'Selected ingredients' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

const box = (name) => screen.getByRole('checkbox', { name });

async function renderReady({ pantry = [EGG], matches = [TOAST] } = {}) {
  getPantry.mockResolvedValue(pantry);
  getMyMatches.mockResolvedValue(matches);
  renderPantry();
  await screen.findByRole('heading', { name: 'In your pantry' });
}

beforeEach(() => {
  vi.resetAllMocks();
  useAuth.mockReturnValue({ token: 'tok' });
});

describe('PantryPage: loading', () => {
  it('shows a loading message, and no picker, while the pantry loads', () => {
    getPantry.mockReturnValue(new Promise(() => {}));
    getMyMatches.mockReturnValue(new Promise(() => {}));

    renderPantry();

    expect(screen.getByRole('heading', { name: 'My pantry' })).toBeInTheDocument();
    expect(screen.getByText('Loading your pantry…')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows the same message while the ingredient list loads', async () => {
    getPantry.mockResolvedValue([EGG]);
    getMyMatches.mockResolvedValue([]);

    renderPantry({ catalog: catalogState({ status: 'loading', data: [] }) });

    expect(screen.getByText('Loading your pantry…')).toBeInTheDocument();
    await waitFor(() => expect(getPantry).toHaveBeenCalled());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows an ingredient-list error with a retry wired to the catalog', async () => {
    const retry = vi.fn();
    getPantry.mockResolvedValue([EGG]);
    getMyMatches.mockResolvedValue([]);
    const user = userEvent.setup();

    renderPantry({
      catalog: catalogState({ status: 'error', data: [], error: 'Could not reach the server.', retry }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load ingredients: Could not reach the server.'
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows a pantry error, and retrying loads the pantry again', async () => {
    getPantry
      .mockRejectedValueOnce(apiError('Could not reach the server.'))
      .mockResolvedValueOnce([EGG]);
    getMyMatches.mockResolvedValue([]);
    const user = userEvent.setup();

    renderPantry();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your pantry: Could not reach the server.'
    );

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'In your pantry' })).toBeInTheDocument();
    expect(chips()).toEqual(['egg×']);
    expect(getPantry).toHaveBeenCalledTimes(2);
  });
});

describe('PantryPage: showing the saved pantry', () => {
  it('asks the server for this user\'s pantry and matches, using their token', async () => {
    await renderReady();

    expect(getPantry).toHaveBeenCalledWith('tok', expect.any(AbortSignal));
    expect(getMyMatches).toHaveBeenCalledWith('tok', {
      maxMissing: '',
      signal: expect.any(AbortSignal),
    });
  });

  it('lists the saved ingredients as chips and ticks them in the picker', async () => {
    await renderReady({ pantry: [BUTTER, EGG] });

    expect(chips()).toEqual(['egg×', 'butter×']);
    expect(box('egg')).toBeChecked();
    expect(box('butter')).toBeChecked();
    expect(box('bread')).not.toBeChecked();
    expect(
      screen.getByRole('heading', { name: 'Add or remove ingredients' })
    ).toBeInTheDocument();
  });

  it('shows chips in catalog order, not in the order the server listed them', async () => {
    await renderReady({ pantry: [BREAD, EGG] });

    expect(chips()).toEqual(['egg×', 'bread×']);
  });

  it('shows a pantry-specific message when the pantry is empty', async () => {
    await renderReady({ pantry: [] });

    expect(screen.getByText('Your pantry is empty. Tick some ingredients below.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Selected ingredients' })).not.toBeInTheDocument();
  });

  it('has no "Clear all" button: removing is one ingredient at a time', async () => {
    await renderReady();

    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });
});

describe('PantryPage: matches against the saved pantry', () => {
  it('shows the ranked recipes the server returns', async () => {
    await renderReady();

    expect(await screen.findByRole('link', { name: 'Buttered toast' })).toHaveAttribute(
      'href',
      '/recipes/7'
    );
    expect(screen.getByText('You still need: salt')).toBeInTheDocument();
  });

  it('shows a match error as an alert while the pantry stays usable', async () => {
    getPantry.mockResolvedValue([EGG]);
    getMyMatches.mockRejectedValue(apiError('Something went wrong.'));
    renderPantry();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not find recipes: Something went wrong.'
    );
    expect(box('egg')).toBeEnabled();
    expect(chips()).toEqual(['egg×']);
  });

  it('asks again with the new limit when "missing ingredients" changes', async () => {
    await renderReady();
    const user = userEvent.setup();

    await user.selectOptions(
      screen.getByLabelText('How many missing ingredients are OK?'),
      'None (I can make it now)'
    );

    await waitFor(() =>
      expect(getMyMatches).toHaveBeenLastCalledWith('tok', {
        maxMissing: '0',
        signal: expect.any(AbortSignal),
      })
    );
    expect(getMyMatches).toHaveBeenCalledTimes(2);
  });
});

describe('PantryPage: changing the pantry', () => {
  it('adds an ingredient on tick, shows it at once, and refreshes the matches afterwards', async () => {
    addToPantry.mockResolvedValue({ id: 2, name: 'butter' });
    await renderReady();
    const user = userEvent.setup();

    await user.click(box('butter'));

    expect(addToPantry).toHaveBeenCalledWith('tok', 2);
    expect(chips()).toEqual(['egg×', 'butter×']);
    await waitFor(() => expect(getMyMatches).toHaveBeenCalledTimes(2));
  });

  it('removes an ingredient with its chip button and refreshes the matches', async () => {
    removeFromPantry.mockResolvedValue(null);
    await renderReady({ pantry: [EGG, BUTTER] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Remove egg' }));

    expect(removeFromPantry).toHaveBeenCalledWith('tok', 1);
    expect(chips()).toEqual(['butter×']);
    expect(box('egg')).not.toBeChecked();
    await waitFor(() => expect(getMyMatches).toHaveBeenCalledTimes(2));
  });

  it('rolls back a failed add, explains why, and does not refresh the matches', async () => {
    addToPantry.mockRejectedValue(apiError('Unknown ingredient', 400));
    await renderReady();
    const user = userEvent.setup();

    await user.click(box('butter'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update your pantry: Unknown ingredient'
    );
    expect(chips()).toEqual(['egg×']);
    expect(box('butter')).not.toBeChecked();
    expect(box('butter')).toBeEnabled();
    expect(getMyMatches).toHaveBeenCalledTimes(1);
  });

  it('disables an ingredient while its request is in flight', async () => {
    addToPantry.mockReturnValue(new Promise(() => {}));
    await renderReady();
    const user = userEvent.setup();

    await user.click(box('butter'));

    expect(box('butter')).toBeDisabled();
    expect(box('bread')).toBeEnabled();
  });
});