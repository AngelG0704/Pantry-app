import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { installFakeResizeObserver, stubRowLayout } from '../test/fakeResizeObserver.js';
import { MemoryRouter } from 'react-router';
import RecipeResults from './RecipeResults.jsx';

// The shape the match endpoints return (pinned by matching.test.js on the server).
const COMPLETE = {
  id: 1,
  title: 'Scrambled eggs',
  prepMinutes: 5,
  matchedCount: 2,
  totalCount: 2,
  matchScore: 1,
  missingIngredients: [],
  ingredients: ['butter', 'egg'],
};

const PARTIAL = {
  id: 5,
  title: 'Cheese omelette',
  prepMinutes: 10,
  matchedCount: 2,
  totalCount: 3,
  matchScore: 0.67,
  missingIngredients: ['cheese'],
  ingredients: ['butter', 'cheese', 'egg'],
};

const NO_PREP = {
  id: 9,
  title: 'Mystery bowl',
  prepMinutes: null,
  matchedCount: 1,
  totalCount: 3,
  matchScore: 0.33,
  missingIngredients: ['bread', 'salt'],
  ingredients: ['bread', 'rice', 'salt'],
};

function renderResults(props = {}) {
  return render(
    <MemoryRouter>
      <RecipeResults status="success" data={[]} error="" {...props} />
    </MemoryRouter>
  );
}

describe('RecipeResults', () => {
  it('renders nothing at all before the first search', () => {
    const { container } = renderResults({ status: 'idle' });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a loading message under the heading', () => {
    renderResults({ status: 'loading' });

    expect(screen.getByRole('heading', { name: 'Recipes you can make' })).toBeInTheDocument();
    expect(screen.getByText('Finding recipes…')).toBeInTheDocument();
  });

  it('shows the error as an alert', () => {
    renderResults({ status: 'error', error: 'Could not reach the server.' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not find recipes: Could not reach the server.'
    );
  });

  it('says so when nothing matches', () => {
    renderResults({ data: [] });

    expect(
      screen.getByText('No recipes match those ingredients yet. Try adding more.')
    ).toBeInTheDocument();
  });

  it('shows a recipe as a link to its page, with prep time, counts, and a progress bar', () => {
    renderResults({ data: [COMPLETE] });

    expect(screen.getByRole('link', { name: 'Scrambled eggs' })).toHaveAttribute(
      'href',
      '/recipes/1'
    );
    expect(screen.getByText('5 min · 2 of 2 ingredients')).toBeInTheDocument();

    const bar = screen.getByRole('progressbar', { name: '2 of 2 ingredients' });
    expect(bar.max).toBe(2);
    expect(bar.value).toBe(2);
  });

  it('says "You can make this now" only for a complete recipe, and lists what else is needed', () => {
    renderResults({ data: [COMPLETE, PARTIAL] });

    expect(screen.getAllByText('You can make this now.')).toHaveLength(1);
    expect(screen.getByText('You still need: cheese')).toBeInTheDocument();
  });

  it('leaves out the prep time when there is none, and joins several missing items', () => {
    renderResults({ data: [NO_PREP] });

    expect(screen.getByText('1 of 3 ingredients')).toBeInTheDocument();
    expect(screen.queryByText(/min ·/)).not.toBeInTheDocument();
    expect(screen.getByText('You still need: bread, salt')).toBeInTheDocument();
  });

  it('keeps the order the server sent', () => {
    renderResults({ data: [PARTIAL, COMPLETE, NO_PREP] });

    const list = screen.getByRole('list');
    const titles = within(list)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(titles).toEqual(['Cheese omelette', 'Scrambled eggs', 'Mystery bowl']);
  });

    it('scrolls inside a frame only past scrollAfter recipes', () => {
    const many = (count) =>
      Array.from({ length: count }, (_, i) => ({ ...PARTIAL, id: 100 + i, title: `Recipe ${i}` }));

    const { unmount } = renderResults({ status: 'success', data: many(2), scrollAfter: 2 });
    expect(screen.getByRole('list')).not.toHaveClass('scroll-frame');
    unmount();

    renderResults({ status: 'success', data: many(3), scrollAfter: 2 });
    expect(screen.getByRole('list')).toHaveClass('scroll-frame');
  });

  it('never scrolls without a limit (the home page)', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...PARTIAL, id: 200 + i, title: `R${i}` }));
    renderResults({ status: 'success', data: many });

    expect(screen.getByRole('list')).not.toHaveClass('scroll-frame');
  });

    it('has no search box unless asked for one', () => {
    renderResults({ status: 'success', data: [COMPLETE, PARTIAL] });

    expect(screen.queryByRole('searchbox', { name: 'Search recipes' })).not.toBeInTheDocument();
  });

  it('filters by title or by a missing ingredient', async () => {
    const user = userEvent.setup();
    renderResults({ status: 'success', data: [COMPLETE, PARTIAL, NO_PREP], searchable: true });
    const search = screen.getByRole('searchbox', { name: 'Search recipes' });

    await user.type(search, 'OMEL');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Cheese omelette',
    ]);

    await user.clear(search);
    await user.type(search, 'salt');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Mystery bowl',
    ]);

    await user.clear(search);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('also finds a recipe by an ingredient you already have', async () => {
    const user = userEvent.setup();
    renderResults({ status: 'success', data: [COMPLETE, PARTIAL, NO_PREP], searchable: true });
    const search = screen.getByRole('searchbox', { name: 'Search recipes' });

    // rice: in Mystery bowl's ingredients, but not in its title or its missing list.
    await user.type(search, 'rice');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Mystery bowl',
    ]);

    // butter: had by two recipes, in neither title; they keep the server's order.
    await user.clear(search);
    await user.type(search, 'Butter');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Scrambled eggs',
      'Cheese omelette',
    ]);
  });

  it('says so when no recipe matches the search', async () => {
    const user = userEvent.setup();
    renderResults({ status: 'success', data: [COMPLETE, PARTIAL], searchable: true });

    await user.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'pizza');

    expect(screen.getByText('No recipes match “pizza”.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  describe('"Use soon" label', () => {
    it('lists the soon ingredients a recipe uses, with today / tomorrow / in N days', () => {
      const soonItems = [
        { name: 'rice', daysLeft: 3 },
        { name: 'butter', daysLeft: 0 },
        { name: 'egg', daysLeft: 1 },
      ];
      renderResults({ data: [COMPLETE, NO_PREP], soonItems });

      expect(screen.getByText('Use soon: butter (today), egg (tomorrow)')).toBeInTheDocument();
      expect(screen.getByText('Use soon: rice (in 3 days)')).toBeInTheDocument();
    });

    it('puts the soonest first, whatever order the items arrive in', () => {
      // Expected order differs from both the input order and A–Z.
      renderResults({
        data: [COMPLETE],
        soonItems: [
          { name: 'butter', daysLeft: 2 },
          { name: 'egg', daysLeft: 0 },
        ],
      });

      expect(screen.getByText('Use soon: egg (today), butter (in 2 days)')).toBeInTheDocument();
    });

    it('breaks a tie by name, A–Z', () => {
      renderResults({
        data: [COMPLETE],
        soonItems: [
          { name: 'egg', daysLeft: 1 },
          { name: 'butter', daysLeft: 1 },
        ],
      });

      expect(screen.getByText('Use soon: butter (tomorrow), egg (tomorrow)')).toBeInTheDocument();
    });

    it('shows a label only on the cards that use a soon item', () => {
      renderResults({
        data: [COMPLETE, PARTIAL, NO_PREP],
        soonItems: [{ name: 'rice', daysLeft: 0 }],
      });

      const cards = screen.getAllByRole('listitem');
      expect(within(cards[0]).queryByText(/^Use soon:/)).not.toBeInTheDocument();
      expect(within(cards[1]).queryByText(/^Use soon:/)).not.toBeInTheDocument();
      expect(within(cards[2]).getByText('Use soon: rice (today)')).toBeInTheDocument();
    });

    it('shows no label without the prop (the home page) or with no overlap', () => {
      const { unmount } = renderResults({ data: [COMPLETE, PARTIAL] });
      expect(screen.queryByText(/^Use soon:/)).not.toBeInTheDocument();
      unmount();

      renderResults({ data: [COMPLETE, PARTIAL], soonItems: [{ name: 'milk', daysLeft: 0 }] });
      expect(screen.queryByText(/^Use soon:/)).not.toBeInTheDocument();
    });

    it('does not change the order of the cards', () => {
      renderResults({
        data: [PARTIAL, COMPLETE, NO_PREP],
        soonItems: [{ name: 'rice', daysLeft: 0 }],
      });

      const titles = screen.getAllByRole('link').map((link) => link.textContent);
      expect(titles).toEqual(['Cheese omelette', 'Scrambled eggs', 'Mystery bowl']);
    });
  });

  it('counts only the matching recipes toward the scroll frame', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 5 }, (_, i) => ({ ...PARTIAL, id: 300 + i, title: `Pie ${i}` }));
    renderResults({ status: 'success', data: [...many, COMPLETE], scrollAfter: 2, searchable: true });
    expect(screen.getByRole('list')).toHaveClass('scroll-frame');

    await user.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'scrambled');

    expect(screen.getByRole('list')).not.toHaveClass('scroll-frame');
  });
});

describe('RecipeResults: measured frame', () => {
  // Nine cards; each has its own third ingredient, so a "Use soon" label can pick one card.
  const cards = Array.from({ length: 9 }, (_, i) => ({
    ...PARTIAL,
    id: 400 + i,
    title: `Card ${i}`,
    ingredients: ['butter', 'cheese', `spice ${i}`],
  }));
  // A card is 80px, 100px with a "Use soon" line; .results puts 12px between cards.
  const heightOf = (li) => (li.querySelector('.use-soon') ? 100 : 80);
  const FIRST_EIGHT = 8 * 80 + 7 * 12; // 724
  const frameHeight = () => screen.getByRole('list').style.getPropertyValue('--frame-height');

  beforeEach(() => {
    installFakeResizeObserver();
    stubRowLayout(heightOf, 12);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sizes the frame to the first scrollAfter cards', () => {
    renderResults({ data: cards, scrollAfter: 8 });

    expect(frameHeight()).toBe(`${FIRST_EIGHT}px`);
  });

  it('grows the frame when a card among the first scrollAfter gains a "Use soon" line', () => {
    const { rerender } = renderResults({ data: cards, scrollAfter: 8 });

    rerender(
      <MemoryRouter>
        <RecipeResults
          status="success"
          data={cards}
          error=""
          scrollAfter={8}
          soonItems={[{ name: 'spice 0', daysLeft: 1 }]}
        />
      </MemoryRouter>
    );

    expect(frameHeight()).toBe(`${FIRST_EIGHT + 20}px`);
  });

  it('sets no height when the cards fit, or once a search leaves scrollAfter or fewer', async () => {
    const user = userEvent.setup();
    const { unmount } = renderResults({ data: cards.slice(0, 8), scrollAfter: 8 });
    expect(frameHeight()).toBe('');
    unmount();

    renderResults({ data: cards, scrollAfter: 8, searchable: true });
    expect(frameHeight()).toBe(`${FIRST_EIGHT}px`);

    await user.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'Card 1');
    expect(frameHeight()).toBe('');
  });

  it('sets no height without ResizeObserver, so the CSS fallback applies', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    renderResults({ data: cards, scrollAfter: 8 });

    expect(screen.getByRole('list')).toHaveClass('scroll-frame');
    expect(frameHeight()).toBe('');
  });
});