import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
};

const PARTIAL = {
  id: 5,
  title: 'Cheese omelette',
  prepMinutes: 10,
  matchedCount: 2,
  totalCount: 3,
  matchScore: 0.67,
  missingIngredients: ['cheese'],
};

const NO_PREP = {
  id: 9,
  title: 'Mystery bowl',
  prepMinutes: null,
  matchedCount: 1,
  totalCount: 3,
  matchScore: 0.33,
  missingIngredients: ['bread', 'salt'],
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

  it('says so when no recipe matches the search', async () => {
    const user = userEvent.setup();
    renderResults({ status: 'success', data: [COMPLETE, PARTIAL], searchable: true });

    await user.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'pizza');

    expect(screen.getByText('No recipes match “pizza”.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
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