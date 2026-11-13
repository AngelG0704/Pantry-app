import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PantrySortSelect from './PantrySortSelect.jsx';

describe('PantrySortSelect', () => {
  it('offers the six sorts in order, labelled "Sort by"', () => {
    render(<PantrySortSelect id="s" value="expiry-asc" onChange={vi.fn()} />);

    // Written out, not read from SORT_OPTIONS: a test built from the same list
    // as the code would pass whatever the list said.
    expect(screen.getAllByRole('option').map((o) => [o.value, o.textContent])).toEqual([
      ['expiry-asc', 'Expiry: soonest first'],
      ['expiry-desc', 'Expiry: latest first'],
      ['added-desc', 'Recently added'],
      ['added-asc', 'Oldest added'],
      ['name-asc', 'Name: A–Z'],
      ['name-desc', 'Name: Z–A'],
    ]);
    expect(screen.getByLabelText('Sort by')).toHaveAttribute('id', 's');
  });

  it('shows the current choice', () => {
    render(<PantrySortSelect id="s" value="added-desc" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Sort by')).toHaveValue('added-desc');
    expect(screen.getByLabelText('Sort by')).toHaveDisplayValue('Recently added');
  });

  it('reports the chosen option by its value, once', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PantrySortSelect id="s" value="expiry-asc" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Sort by'), 'Name: Z–A');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('name-desc');
  });
});
