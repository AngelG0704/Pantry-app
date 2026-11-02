import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IngredientPicker from './IngredientPicker.jsx';

const CATALOG = [
  { id: 1, name: 'egg' },
  { id: 2, name: 'butter' },
  { id: 3, name: 'bread' },
  { id: 4, name: 'cheese' },
];

function renderPicker(props = {}) {
  const onToggle = vi.fn();
  render(
    <IngredientPicker
      ingredients={CATALOG}
      selectedIds={[]}
      onToggle={onToggle}
      {...props}
    />
  );
  return { onToggle };
}

const box = (name) => screen.getByRole('checkbox', { name });
const search = () => screen.getByLabelText('Search ingredients');

describe('IngredientPicker', () => {
  it('lists every ingredient as a checkbox under the default title', () => {
    renderPicker();

    expect(
      screen.getByRole('heading', { name: "What's in your kitchen?" })
    ).toBeInTheDocument();
    for (const { name } of CATALOG) {
      expect(box(name)).toBeInTheDocument();
    }
  });

  it('shows a custom title', () => {
    renderPicker({ title: 'Add or remove ingredients' });

    expect(
      screen.getByRole('heading', { name: 'Add or remove ingredients' })
    ).toBeInTheDocument();
  });

  it('ticks exactly the selected ingredients', () => {
    renderPicker({ selectedIds: [2] });

    expect(box('butter')).toBeChecked();
    expect(box('egg')).not.toBeChecked();
  });

  it('reports the id of a clicked ingredient', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderPicker();

    await user.click(box('egg'));

    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('filters while typing, ignoring case and surrounding spaces', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(search(), 'BU');
    expect(box('butter')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'bread' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'egg' })).not.toBeInTheDocument();

    await user.clear(search());
    await user.type(search(), ' br ');
    expect(box('bread')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'butter' })).not.toBeInTheDocument();
  });

  it('says so, and shows no list, when nothing matches', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(search(), 'zzz');

    expect(screen.getByText('No ingredients match “zzz”.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('disables an ingredient whose request is in flight', () => {
    renderPicker({ pendingIds: [1] });

    expect(box('egg')).toBeDisabled();
    expect(box('butter')).toBeEnabled();
  });

  it('at the limit, blocks new picks but still lets selected ones be unticked', () => {
    renderPicker({ selectedIds: [1, 2], maxSelected: 2 });

    expect(screen.getByText('You can select up to 2 ingredients.')).toBeInTheDocument();
    expect(box('egg')).toBeEnabled();
    expect(box('bread')).toBeDisabled();
  });

  it('shows no limit message when there is no limit', () => {
    renderPicker({ selectedIds: [1, 2, 3, 4] });

    expect(screen.queryByText(/You can select up to/)).not.toBeInTheDocument();
  });
});