import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectedIngredients from './SelectedIngredients.jsx';

const ITEMS = [
  { id: 1, name: 'egg' },
  { id: 2, name: 'butter' },
];

describe('SelectedIngredients', () => {
  it('shows the default message and no list when nothing is selected', () => {
    render(<SelectedIngredients ingredients={[]} onRemove={vi.fn()} />);

    expect(screen.getByText('Nothing selected yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows a custom empty message', () => {
    render(
      <SelectedIngredients
        ingredients={[]}
        onRemove={vi.fn()}
        emptyMessage="Your pantry is empty."
      />
    );

    expect(screen.getByText('Your pantry is empty.')).toBeInTheDocument();
  });

  it('lists each ingredient as a chip with its own labelled remove button', () => {
    render(<SelectedIngredients ingredients={ITEMS} onRemove={vi.fn()} />);

    const list = screen.getByRole('list', { name: 'Selected ingredients' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'egg×',
      'butter×',
    ]);
    expect(screen.getByRole('button', { name: 'Remove egg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove butter' })).toBeInTheDocument();
  });

  it('removes by id when a chip button is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<SelectedIngredients ingredients={ITEMS} onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove butter' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('has no "Clear all" button unless a clear handler is given', () => {
    render(<SelectedIngredients ingredients={ITEMS} onRemove={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });

  it('calls the clear handler when "Clear all" is clicked', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectedIngredients ingredients={ITEMS} onRemove={vi.fn()} onClear={onClear} />
    );

    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});