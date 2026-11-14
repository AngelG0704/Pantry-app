import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import PantryPage from './PantryPage.jsx';
import { useAuth } from '../auth/useAuth.js';
import { addToPantry,
        getMyMatches,
        getPantry,
        removeFromPantry,
        setPantryExpiry,
        updatePantryItem,
} from '../api.js';

vi.mock('../api.js', () => ({
  getPantry: vi.fn(),
  addToPantry: vi.fn(),
  removeFromPantry: vi.fn(),
  setPantryExpiry: vi.fn(),
  updatePantryItem: vi.fn(),
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
  ingredients: ['bread', 'butter', 'salt'],
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

// The names in the "In your pantry" list, in the order shown: ['egg', 'butter'].
const pantryNames = () =>
  within(screen.getByRole('list', { name: 'In your pantry' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.expiry-name').textContent);

// Open an item's row, then remove it with the two-step button.
async function removeViaRow(user, name) {
  await user.click(screen.getByRole('button', { name: `Edit ${name}` }));
  await user.click(screen.getByRole('button', { name: `Remove ${name} from pantry` }));
  await user.click(screen.getByRole('button', { name: `Confirm removing ${name}` }));
}
const box = (name) => screen.getByRole('checkbox', { name });

async function renderReady({ pantry = [EGG], matches = [TOAST], catalog = CATALOG } = {}) {
  getPantry.mockResolvedValue(pantry);
  getMyMatches.mockResolvedValue(matches);
  renderPantry({ catalog: catalogState({ data: catalog }) });
  await screen.findByRole('heading', { name: 'In your pantry' });
}

beforeEach(() => {
  vi.resetAllMocks();
  useAuth.mockReturnValue({ token: 'tok' });
  // The page asks the clock for today. Pin it to Nov 1, 2026, noon local time, so the
  // Nov 10 and Dec 1 dates below get no badge whatever day the tests run.
  // Only Date is faked: userEvent and findBy still need real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 1, 12));
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(pantryNames()).toEqual(['egg']);
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

  it('lists the saved ingredients and ticks them in the picker', async () => {
    await renderReady({ pantry: [BUTTER, EGG] });

    // No dates, so the default sort falls back to name A–Z.
    expect(pantryNames()).toEqual(['butter', 'egg']);
    expect(box('egg')).toBeChecked();
    expect(box('butter')).toBeChecked();
    expect(box('bread')).not.toBeChecked();
    expect(
      screen.getByRole('heading', { name: 'Add or remove ingredients' })
    ).toBeInTheDocument();
  });

  it('orders rows by the sort, not by the server or the catalog', async () => {
    // Server and catalog both say egg, bread; the default sort (no dates: name A–Z) says otherwise.
    await renderReady({ pantry: [EGG, BREAD] });

    expect(pantryNames()).toEqual(['bread', 'egg']);
  });

  it('shows a pantry-specific message when the pantry is empty', async () => {
    await renderReady({ pantry: [] });

    expect(screen.getByText('Your pantry is empty. Tick some ingredients below.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'In your pantry' })).not.toBeInTheDocument();
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
    expect(pantryNames()).toEqual(['egg']);
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
    expect(pantryNames()).toEqual(['butter', 'egg']);
    await waitFor(() => expect(getMyMatches).toHaveBeenCalledTimes(2));
  });

  it('removes an ingredient from its open row and refreshes the matches', async () => {
    removeFromPantry.mockResolvedValue(null);
    await renderReady({ pantry: [EGG, BUTTER] });
    const user = userEvent.setup();

    await removeViaRow(user, 'egg');

    expect(removeFromPantry).toHaveBeenCalledWith('tok', 1);
    expect(pantryNames()).toEqual(['butter']);
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
    expect(pantryNames()).toEqual(['egg']);
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

describe('PantryPage: expiry dates', () => {
  const DATED_EGG = { ...EGG, expiresOn: '2026-11-10' };
  const UNDATED_BUTTER = { ...BUTTER, expiresOn: null };

  // One row of the "Expiry dates" list, found by the ingredient's name.
  const expiryRow = (name) =>
    within(screen.getByRole('list', { name: 'In your pantry' }))
      .getByText(name)
      .closest('li');

  it('shows each saved date from the server, or "No date"', async () => {
    await renderReady({ pantry: [DATED_EGG, UNDATED_BUTTER] });

    expect(screen.getByRole('heading',{ name: 'In your pantry' })).toBeInTheDocument();
    expect(expiryRow('egg')).toHaveTextContent('expires Nov 10, 2026');
    expect(expiryRow('butter')).toHaveTextContent('No date');
  });

  it("badges rows using today's date where the user is", async () => {
    // 11:30 pm local on Nov 9. West of UTC it is already Nov 10 in UTC; a page that
    // used the UTC day would call egg expired. Today counts as soon.
    vi.setSystemTime(new Date(2026, 10, 9, 23, 30));
    await renderReady({
      pantry: [
        { ...EGG, expiresOn: '2026-11-09' },
        { ...BUTTER, expiresOn: '2026-11-08' },
        { ...BREAD, expiresOn: '2026-11-13' },
      ],
    });

    expect(expiryRow('egg')).toHaveTextContent('Soon · expires Nov 9, 2026');
    expect(expiryRow('egg')).toHaveClass('expiry-row--soon');
    expect(expiryRow('butter')).toHaveTextContent('Expired · expires Nov 8, 2026');
    expect(expiryRow('bread')).not.toHaveTextContent(/Expired|Soon/);
  });

  it('saves a date, shows what the server returned, and does not refresh the matches', async () => {
    setPantryExpiry.mockResolvedValue({ id: 2, name: 'butter', expiresOn: '2026-12-01' });
    await renderReady({ pantry: [DATED_EGG, UNDATED_BUTTER] });
    const user = userEvent.setup();
    
    await user.click(screen.getByRole('button', { name: 'Edit butter' }));
    await user.type(screen.getByLabelText('Expiry date for butter'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Save expiry date for butter' }));

    expect(setPantryExpiry).toHaveBeenCalledWith('tok', 2, '2026-12-01');
    expect(await within(expiryRow('butter')).findByText('expires Dec 1, 2026')).toBeInTheDocument();
    expect(getMyMatches).toHaveBeenCalledTimes(1);
  });

  it('clears a date', async () => {
    setPantryExpiry.mockResolvedValue({ id: 1, name: 'egg', expiresOn: null });
    await renderReady({ pantry: [DATED_EGG] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit egg' }));
    await user.click(screen.getByRole('button', { name: 'Clear expiry date for egg' }));

    expect(setPantryExpiry).toHaveBeenCalledWith('tok', 1, null);
    expect(await within(expiryRow('egg')).findByText('No date')).toBeInTheDocument();
    expect(screen.getByLabelText('Expiry date for egg')).toHaveValue('');
  });

  it('explains a failed save and keeps the old date', async () => {
    setPantryExpiry.mockRejectedValue(apiError('Ingredient not in pantry', 404));
    await renderReady({ pantry: [DATED_EGG] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit egg' }));
    await user.clear(screen.getByLabelText('Expiry date for egg'));
    await user.type(screen.getByLabelText('Expiry date for egg'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Save expiry date for egg' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update your pantry: Ingredient not in pantry'
    );
    expect(expiryRow('egg')).toHaveTextContent('expires Nov 10, 2026');
  });

  it('gives a newly ticked ingredient a row with no date', async () => {
    addToPantry.mockResolvedValue({ id: 2, name: 'butter' });
    await renderReady({ pantry: [DATED_EGG] });
    const user = userEvent.setup();

    await user.click(box('butter'));

    expect(expiryRow('butter')).toHaveTextContent('No date');
  });

  it('removes the row when the ingredient is removed', async () => {
    removeFromPantry.mockResolvedValue(null);
    await renderReady({ pantry: [DATED_EGG, UNDATED_BUTTER] });
    const user = userEvent.setup();

    await removeViaRow(user, 'egg');
    
    expect(
      within(screen.getByRole('list', { name: 'In your pantry' })).queryByText('egg')
    ).not.toBeInTheDocument();
  });

  it('shows no item list for an empty pantry', async () => {
    await renderReady({ pantry: [] });

    expect(screen.queryByRole('list', { name: 'In your pantry' })).not.toBeInTheDocument();
  });
});

describe('PantryPage: amounts', () => {
  const FULL_EGG = { ...EGG, expiresOn: '2026-11-10', quantity: 6, unit: 'piece' };
  const BARE_BUTTER = { ...BUTTER, expiresOn: null, quantity: null, unit: null };

  const detailsRow = (name) =>
    within(screen.getByRole('list', { name: 'In your pantry' }))
      .getByText(name)
      .closest('li');

  it('shows each saved amount from the server, with the date', async () => {
    await renderReady({ pantry: [FULL_EGG, BARE_BUTTER] });

    expect(detailsRow('egg')).toHaveTextContent('6 pieces · expires Nov 10, 2026');
    expect(detailsRow('butter')).toHaveTextContent('No amount · No date');
  });

  it('saves an amount, sends only the amount, and shows what the server returned', async () => {
    updatePantryItem.mockResolvedValue({ ...BARE_BUTTER, quantity: 1.5, unit: 'cup' });
    await renderReady({ pantry: [FULL_EGG, BARE_BUTTER] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit butter' }));
    await user.type(screen.getByLabelText('Quantity for butter'), '1.5');
    await user.selectOptions(screen.getByLabelText('Unit for butter'), 'cup');
    await user.click(screen.getByRole('button', { name: 'Save amount for butter' }));

    expect(updatePantryItem).toHaveBeenCalledWith('tok', 2, { quantity: 1.5, unit: 'cup' });
    expect(await within(detailsRow('butter')).findByText('1.5 cup')).toBeInTheDocument();
    expect(detailsRow('butter')).toHaveTextContent('1.5 cup · No date');
    expect(getMyMatches).toHaveBeenCalledTimes(1);
  });

  it('clears an amount and keeps the date', async () => {
    updatePantryItem.mockResolvedValue({ ...FULL_EGG, quantity: null, unit: null });
    await renderReady({ pantry: [FULL_EGG] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit egg' }));
    await user.click(screen.getByRole('button', { name: 'Clear amount for egg' }));

    expect(updatePantryItem).toHaveBeenCalledWith('tok', 1, { quantity: null, unit: null });
    expect(await within(detailsRow('egg')).findByText('No amount')).toBeInTheDocument();
    expect(detailsRow('egg')).toHaveTextContent('No amount · expires Nov 10, 2026');
  });

  it('keeps the amount when the date is saved', async () => {
    setPantryExpiry.mockResolvedValue({ ...FULL_EGG, expiresOn: '2026-12-01' });
    await renderReady({ pantry: [FULL_EGG] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit egg' }));
    await user.clear(screen.getByLabelText('Expiry date for egg'));
    await user.type(screen.getByLabelText('Expiry date for egg'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Save expiry date for egg' }));

    expect(
      await within(detailsRow('egg')).findByText('expires Dec 1, 2026')
    ).toBeInTheDocument();
    expect(detailsRow('egg')).toHaveTextContent('6 pieces · expires Dec 1, 2026');
  });

  it('explains a rejected amount and keeps the old one', async () => {
    updatePantryItem.mockRejectedValue(
      apiError('unit must be one of g, kg, ml, l, tsp, tbsp, cup, oz, lb, piece, or null', 400)
    );
    await renderReady({ pantry: [FULL_EGG] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit egg' }));
    await user.selectOptions(screen.getByLabelText('Unit for egg'), 'g');
    await user.click(screen.getByRole('button', { name: 'Save amount for egg' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update your pantry: unit must be one of'
    );
    expect(detailsRow('egg')).toHaveTextContent('6 pieces');
  });
});

describe('PantryPage: long lists', () => {
  it('puts more than 8 recipes in a scrolling frame', async () => {
    const recipes = Array.from({ length: 9 }, (_, i) => ({ ...TOAST, id: 100 + i, title: `Toast ${i}` }));
    await renderReady({ matches: recipes });

    const results = (await screen.findByText('Toast 8')).closest('ul');
    expect(results).toHaveClass('scroll-frame');
  });

  it('keeps up to 8 recipes as a plain list', async () => {
    const recipes = Array.from({ length: 8 }, (_, i) => ({ ...TOAST, id: 100 + i, title: `Toast ${i}` }));
    await renderReady({ matches: recipes });

    const results = (await screen.findByText('Toast 7')).closest('ul');
    expect(results).not.toHaveClass('scroll-frame');
  });
});

describe('PantryPage: searching', () => {
  it('filters the pantry list by name, ignoring case', async () => {
    await renderReady({ pantry: [EGG, BUTTER, BREAD] });
    const user = userEvent.setup();

    await user.type(screen.getByRole('searchbox', { name: 'Search your pantry' }), 'BU');

    expect(pantryNames()).toEqual(['butter']);
  });

  it('says so when nothing in the pantry matches, and shows everything again when cleared', async () => {
    await renderReady({ pantry: [EGG, BUTTER] });
    const user = userEvent.setup();
    const search = screen.getByRole('searchbox', { name: 'Search your pantry' });

    await user.type(search, 'milk');
    expect(screen.getByText('No pantry items match “milk”.')).toBeInTheDocument();

    await user.clear(search);
    expect(pantryNames()).toEqual(['butter', 'egg']);
  });

  it('shows no pantry search for an empty pantry', async () => {
    await renderReady({ pantry: [] });

    expect(
      screen.queryByRole('searchbox', { name: 'Search your pantry' })
    ).not.toBeInTheDocument();
  });

  it('only filters what is shown: the ingredient picker still lists everything', async () => {
    await renderReady({ pantry: [EGG, BUTTER] });
    const user = userEvent.setup();

    await user.type(screen.getByRole('searchbox', { name: 'Search your pantry' }), 'egg');

    expect(box('butter')).toBeChecked();
  });

  it('has a recipe search on this page', async () => {
    await renderReady({ matches: [TOAST] });
    const user = userEvent.setup();

    await user.type(await screen.findByRole('searchbox', { name: 'Search recipes' }), 'pizza');

    expect(screen.getByText('No recipes match “pizza”.')).toBeInTheDocument();
  });
});

describe('PantryPage: "Use soon" label on recipes', () => {
  const OMELETTE = {
    id: 8,
    title: 'Cheese omelette',
    prepMinutes: 10,
    matchedCount: 2,
    totalCount: 3,
    matchScore: 0.67,
    missingIngredients: ['cheese'],
    ingredients: ['butter', 'cheese', 'egg'],
  };
  const dated = (base, expiresOn) => ({ ...base, expiresOn, quantity: null, unit: null });

  // The recipe card with this title.
  const card = (title) => screen.getByRole('link', { name: title }).closest('li');
  const renderWithMatches = async (pantry) => {
    await renderReady({ pantry, matches: [TOAST, OMELETTE] });
    await screen.findByRole('link', { name: 'Cheese omelette' });
  };

  // Today is Nov 1 (beforeEach): egg today, butter in 2 days (both soon), bread in 4 (ok).
  const SOON_PANTRY = [
    dated(EGG, '2026-11-01'),
    dated(BUTTER, '2026-11-03'),
    dated(BREAD, '2026-11-05'),
  ];

  it('labels each recipe with the soon items it uses, and only those', async () => {
    await renderWithMatches(SOON_PANTRY);

    expect(card('Cheese omelette')).toHaveTextContent('Use soon: egg (today), butter (in 2 days)');
    // Toast uses bread too, but bread is 4 days away: ok, not soon.
    expect(card('Buttered toast')).toHaveTextContent('Use soon: butter (in 2 days)');
  });

  it("works the days out from today's date", async () => {
    // One day later: egg has expired, butter is now tomorrow, bread is in 3 days.
    vi.setSystemTime(new Date(2026, 10, 2, 12));
    await renderWithMatches(SOON_PANTRY);

    expect(card('Cheese omelette')).toHaveTextContent('Use soon: butter (tomorrow)');
    expect(card('Buttered toast')).toHaveTextContent(
      'Use soon: butter (tomorrow), bread (in 3 days)'
    );
  });

  it('leaves out expired and undated items', async () => {
    await renderWithMatches([
      dated(EGG, '2026-10-31'),
      dated(BUTTER, null),
      dated(BREAD, '2026-11-02'),
    ]);

    expect(card('Cheese omelette')).not.toHaveTextContent('Use soon');
    expect(card('Buttered toast')).toHaveTextContent('Use soon: bread (tomorrow)');
  });

  it('uses the whole pantry, whatever the pantry search shows', async () => {
    await renderWithMatches(SOON_PANTRY);
    const user = userEvent.setup();

    await user.type(screen.getByRole('searchbox', { name: 'Search your pantry' }), 'bread');

    expect(pantryNames()).toEqual(['bread']);
    expect(card('Cheese omelette')).toHaveTextContent('Use soon: egg (today), butter (in 2 days)');
  });

  it('updates the label when a date is saved, without asking for matches again', async () => {
    setPantryExpiry.mockResolvedValue(dated(EGG, '2026-11-02'));
    await renderWithMatches([dated(EGG, null)]);
    const user = userEvent.setup();
    expect(card('Cheese omelette')).not.toHaveTextContent('Use soon');

    await user.click(screen.getByRole('button', { name: 'Edit egg' }));
    await user.type(screen.getByLabelText('Expiry date for egg'), '2026-11-02');
    await user.click(screen.getByRole('button', { name: 'Save expiry date for egg' }));

    await waitFor(() =>
      expect(card('Cheese omelette')).toHaveTextContent('Use soon: egg (tomorrow)')
    );
    expect(getMyMatches).toHaveBeenCalledTimes(1);
  });
});

describe('PantryPage: sorting', () => {
  const MILK = { id: 4, name: 'milk' };
  const SORT_CATALOG = [EGG, BUTTER, BREAD, MILK];
  const item = (base, expiresOn, addedAt) => ({
    ...base,
    expiresOn,
    quantity: null,
    unit: null,
    addedAt,
  });
  // Picked so all six sorts give six different orders, none of them the server's
  // or the catalog's (egg, butter, bread, milk). Added, oldest first: egg, milk, butter, bread.
  const SORT_PANTRY = [
    item(EGG, '2026-11-20', '2026-10-01T09:00:00.000Z'),
    item(BUTTER, null, '2026-10-03T09:00:00.000Z'),
    item(BREAD, '2026-11-10', '2026-10-04T09:00:00.000Z'),
    item(MILK, '2026-11-05', '2026-10-02T09:00:00.000Z'),
  ];
  const sortSelect = () => screen.getByLabelText('Sort by');
  const renderSorted = (pantry = SORT_PANTRY) =>
    renderReady({ pantry, catalog: SORT_CATALOG });

  it('starts on "Expiry: soonest first", with undated items last', async () => {
    await renderSorted();

    expect(sortSelect()).toHaveValue('expiry-asc');
    expect(sortSelect()).toHaveDisplayValue('Expiry: soonest first');
    expect(pantryNames()).toEqual(['milk', 'bread', 'egg', 'butter']);
  });

  it('reorders the rows for each choice', async () => {
    await renderSorted();
    const user = userEvent.setup();
    // Each order differs from the one before, so a choice that changed nothing would show.
    const cases = [
      ['Name: Z–A', ['milk', 'egg', 'butter', 'bread']],
      ['Expiry: latest first', ['egg', 'bread', 'milk', 'butter']],
      ['Recently added', ['bread', 'butter', 'milk', 'egg']],
      ['Oldest added', ['egg', 'milk', 'butter', 'bread']],
      ['Name: A–Z', ['bread', 'butter', 'egg', 'milk']],
      ['Expiry: soonest first', ['milk', 'bread', 'egg', 'butter']],
    ];

    for (const [label, names] of cases) {
      await user.selectOptions(sortSelect(), label);
      expect(pantryNames(), label).toEqual(names);
    }
  });

  it('filters, then sorts what is left, and keeps the sort when the search is cleared', async () => {
    await renderSorted();
    const user = userEvent.setup();
    const search = screen.getByRole('searchbox', { name: 'Search your pantry' });

    // The catalog order of the two "b" items is butter, bread; this sort must give the
    // other order, or an unsorted list would pass the first check by luck.
    await user.selectOptions(sortSelect(), 'Expiry: latest first');
    await user.type(search, 'b');
    expect(pantryNames()).toEqual(['bread', 'butter']);

    await user.clear(search);
    expect(sortSelect()).toHaveValue('expiry-desc');
    expect(pantryNames()).toEqual(['egg', 'bread', 'milk', 'butter']);
  });

  it('keeps the sort control when a search matches nothing', async () => {
    await renderSorted();
    const user = userEvent.setup();

    await user.type(screen.getByRole('searchbox', { name: 'Search your pantry' }), 'zzz');

    expect(screen.getByText('No pantry items match “zzz”.')).toBeInTheDocument();
    expect(sortSelect()).toBeInTheDocument();
  });

  it('shows no sort control for an empty pantry', async () => {
    await renderSorted([]);

    expect(screen.queryByLabelText('Sort by')).not.toBeInTheDocument();
  });

  it('puts a just-ticked item at the top of "Recently added", before and after the server answers', async () => {
    let answer;
    addToPantry.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await renderSorted(SORT_PANTRY.filter((row) => row.id !== BREAD.id));
    const user = userEvent.setup();

    await user.selectOptions(sortSelect(), 'Recently added');
    expect(pantryNames()).toEqual(['butter', 'milk', 'egg']);

    // Still waiting for the server: no addedAt yet, which counts as newest.
    await user.click(box('bread'));
    expect(pantryNames()).toEqual(['bread', 'butter', 'milk', 'egg']);

    // The server's addedAt is the newest too, so bread stays where it is.
    answer(item(BREAD, null, '2026-11-01T12:00:00.000Z'));
    await waitFor(() => expect(box('bread')).toBeEnabled());
    expect(pantryNames()).toEqual(['bread', 'butter', 'milk', 'egg']);
  });

  it('moves a row when its new date is saved, and keeps that row open', async () => {
    setPantryExpiry.mockResolvedValue(item(BUTTER, '2026-11-03', '2026-10-03T09:00:00.000Z'));
    await renderSorted();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit butter' }));
    await user.type(screen.getByLabelText('Expiry date for butter'), '2026-11-03');
    await user.click(screen.getByRole('button', { name: 'Save expiry date for butter' }));

    await waitFor(() => expect(pantryNames()).toEqual(['butter', 'milk', 'bread', 'egg']));
    expect(screen.getByRole('button', { name: 'Close butter' })).toBeInTheDocument();
  });
});