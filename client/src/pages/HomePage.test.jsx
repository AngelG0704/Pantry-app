import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import HomePage from './HomePage.jsx';
import { useSearchState } from '../hooks/useSearchState.js';
import { getIngredients, matchRecipes } from '../api.js';

vi.mock('../api.js', () => ({ getIngredients: vi.fn(), matchRecipes: vi.fn() }));

const EGG = { id: 1, name: 'egg' };
const BUTTER = { id: 2, name: 'butter' };
const BREAD = { id: 3, name: 'bread' };
const CATALOG = [EGG, BUTTER, BREAD];

// The shape the match endpoint returns (pinned by matching.test.js on the server).
const RESULT = {
  id: 7,
  title: 'Buttered toast',
  prepMinutes: 5,
  matchedCount: 2,
  totalCount: 3,
  matchScore: 0.67,
  missingIngredients: ['salt'],
};

function apiError(message) {
  return Object.assign(new Error(message), { status: 500 });
}

// ---------- Part 1: the page alone, with a hand-built `search` object ----------

function makeSearch(overrides = {}) {
  return {
    catalog: { status: 'success', data: CATALOG, error: '', retry: vi.fn() },
    matches: { status: 'idle', data: [], error: '' },
    selectedIds: [],
    selected: [],
    maxMissing: '',
    setMaxMissing: vi.fn(),
    toggle: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  };
}

function renderHome(search) {
  render(
    <MemoryRouter>
      <HomePage search={search} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('HomePage: loading the ingredient list', () => {
  it('shows a loading message and no form while the catalog loads', () => {
    renderHome(makeSearch({ catalog: { status: 'loading', data: [], error: '', retry: vi.fn() } }));

    expect(screen.getByText('Loading ingredients…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find recipes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows the error with a retry button wired to the catalog', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    renderHome(makeSearch({ catalog: { status: 'error', data: [], error: 'Could not reach the server.', retry } }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load ingredients: Could not reach the server.'
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows the picker, the selection area, and the search form once loaded', () => {
    renderHome(makeSearch());

    expect(screen.getByRole('heading', { name: "What's in your kitchen?" })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your selection' })).toBeInTheDocument();
    expect(screen.getByText('Nothing selected yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByLabelText('How many missing ingredients are OK?')).toBeInTheDocument();
  });
});

describe('HomePage: wiring to the search state', () => {
  it('ticks what is selected and reports a clicked ingredient by id', async () => {
    const toggle = vi.fn();
    const user = userEvent.setup();
    renderHome(makeSearch({ selectedIds: [2], selected: [BUTTER], toggle }));

    expect(screen.getByRole('checkbox', { name: 'butter' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'egg' })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'egg' }));

    expect(toggle).toHaveBeenCalledWith(1);
  });

  it('removes one ingredient, or all of them, from the selection', async () => {
    const remove = vi.fn();
    const clear = vi.fn();
    const user = userEvent.setup();
    renderHome(makeSearch({ selectedIds: [1, 2], selected: [EGG, BUTTER], remove, clear }));

    await user.click(screen.getByRole('button', { name: 'Remove butter' }));
    expect(remove).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('shows the current maxMissing choice and reports a new one', async () => {
    const setMaxMissing = vi.fn();
    const user = userEvent.setup();
    renderHome(makeSearch({ maxMissing: '1', setMaxMissing }));

    const select = screen.getByLabelText('How many missing ingredients are OK?');
    expect(select).toHaveValue('1');

    await user.selectOptions(select, 'None (I can make it now)');

    expect(setMaxMissing).toHaveBeenCalledWith('0');
  });

  it('blocks new picks at the 50-ingredient limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}` }));
    renderHome(
      makeSearch({
        catalog: { status: 'success', data: [...many, { id: 99, name: 'extra' }], error: '', retry: vi.fn() },
        selectedIds: many.map((m) => m.id),
        selected: many,
      })
    );

    expect(screen.getByText('You can select up to 50 ingredients.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'extra' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'item 1' })).toBeEnabled();
  });
});

describe('HomePage: the Find recipes button', () => {
  it('is disabled until something is selected', () => {
    renderHome(makeSearch());

    expect(screen.getByRole('button', { name: 'Find recipes' })).toBeDisabled();
  });

  it('is enabled with a selection, and submits the search once when clicked', async () => {
    const submit = vi.fn();
    const user = userEvent.setup();
    renderHome(makeSearch({ selectedIds: [1], selected: [EGG], submit }));

    const button = screen.getByRole('button', { name: 'Find recipes' });
    expect(button).toBeEnabled();

    await user.click(button);

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('is disabled while a search is already running', () => {
    renderHome(
      makeSearch({
        selectedIds: [1],
        selected: [EGG],
        matches: { status: 'loading', data: [], error: '' },
      })
    );

    expect(screen.getByRole('button', { name: 'Find recipes' })).toBeDisabled();
  });
});

describe('HomePage: showing results', () => {
  it('shows no results area before the first search', () => {
    renderHome(makeSearch());

    expect(screen.queryByRole('heading', { name: 'Recipes you can make' })).not.toBeInTheDocument();
  });

  it('shows the recipes the search returned', () => {
    renderHome(
      makeSearch({ matches: { status: 'success', data: [RESULT], error: '' } })
    );

    expect(screen.getByRole('link', { name: 'Buttered toast' })).toHaveAttribute('href', '/recipes/7');
    expect(screen.getByText('You still need: salt')).toBeInTheDocument();
  });

  it('keeps the results visible when the ingredient list needs a retry', () => {
    renderHome(
      makeSearch({
        catalog: { status: 'error', data: [], error: 'Could not reach the server.', retry: vi.fn() },
        matches: { status: 'success', data: [RESULT], error: '' },
      })
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buttered toast' })).toBeInTheDocument();
  });
});

// ---------- Part 2: the page together with the real search hook ----------

// Runs the real useSearchState (and so the real useIngredients and
// useRecipeMatches) and hands its result to the page, like App does.
function Harness() {
  const search = useSearchState();
  return <HomePage search={search} />;
}

function renderConnected() {
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  );
}

describe('HomePage with the real search hook', () => {
  it('loads the catalog, lets the user pick, and shows the matches', async () => {
    getIngredients.mockResolvedValue(CATALOG);
    matchRecipes.mockResolvedValue([RESULT]);
    const user = userEvent.setup();

    renderConnected();
    expect(screen.getByText('Loading ingredients…')).toBeInTheDocument();

    await user.click(await screen.findByRole('checkbox', { name: 'egg' }));
    await user.click(screen.getByRole('checkbox', { name: 'butter' }));
    expect(screen.getByRole('button', { name: 'Remove egg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove butter' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Find recipes' }));

    expect(await screen.findByRole('link', { name: 'Buttered toast' })).toBeInTheDocument();
    expect(matchRecipes).toHaveBeenCalledWith([1, 2], {
      maxMissing: '',
      signal: expect.any(AbortSignal),
    });
  });

  it('sends the chosen maxMissing with the search', async () => {
    getIngredients.mockResolvedValue(CATALOG);
    matchRecipes.mockResolvedValue([]);
    const user = userEvent.setup();

    renderConnected();
    await user.click(await screen.findByRole('checkbox', { name: 'egg' }));
    await user.selectOptions(
      screen.getByLabelText('How many missing ingredients are OK?'),
      'None (I can make it now)'
    );
    await user.click(screen.getByRole('button', { name: 'Find recipes' }));

    expect(
      await screen.findByText('No recipes match those ingredients yet. Try adding more.')
    ).toBeInTheDocument();
    expect(matchRecipes).toHaveBeenCalledWith([1], {
      maxMissing: '0',
      signal: expect.any(AbortSignal),
    });
  });

  it('clears the selection and disables the button again', async () => {
    getIngredients.mockResolvedValue(CATALOG);
    const user = userEvent.setup();

    renderConnected();
    await user.click(await screen.findByRole('checkbox', { name: 'egg' }));
    expect(screen.getByRole('button', { name: 'Find recipes' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(screen.getByText('Nothing selected yet.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'egg' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Find recipes' })).toBeDisabled();
  });

  it('shows a failed search as an alert and lets the user search again', async () => {
    getIngredients.mockResolvedValue(CATALOG);
    matchRecipes
      .mockRejectedValueOnce(apiError('Something went wrong.'))
      .mockResolvedValueOnce([RESULT]);
    const user = userEvent.setup();

    renderConnected();
    await user.click(await screen.findByRole('checkbox', { name: 'egg' }));
    await user.click(screen.getByRole('button', { name: 'Find recipes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not find recipes: Something went wrong.'
    );

    await user.click(screen.getByRole('button', { name: 'Find recipes' }));

    expect(await screen.findByRole('link', { name: 'Buttered toast' })).toBeInTheDocument();
    expect(matchRecipes).toHaveBeenCalledTimes(2);
  });

  it('recovers from a failed catalog load when the user clicks Try again', async () => {
    getIngredients
      .mockRejectedValueOnce(apiError('Could not reach the server.'))
      .mockResolvedValueOnce(CATALOG);
    const user = userEvent.setup();

    renderConnected();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('checkbox', { name: 'egg' })).toBeInTheDocument();
    expect(getIngredients).toHaveBeenCalledTimes(2);
  });
});