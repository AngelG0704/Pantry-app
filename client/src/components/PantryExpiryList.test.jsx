import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PantryExpiryList from './PantryExpiryList.jsx';

const EGG = { id: 1, name: 'egg' };
const BUTTER = { id: 2, name: 'butter' };

function renderList({
  items = [EGG, BUTTER],
  expiry = { 1: '2026-11-10', 2: null },
  pendingIds = [],
  onSave = vi.fn().mockResolvedValue(true),
} = {}) {
  render(
    <PantryExpiryList
      items={items}
      expiry={expiry}
      pendingIds={pendingIds}
      onSave={onSave}
    />
  );
  return { onSave };
}

const row = (name) =>
  within(screen.getByRole('list', { name: 'Expiry dates' }))
    .getByText(name)
    .closest('li');
const dateInput = (name) => screen.getByLabelText(`Expiry date for ${name}`);
const saveButton = (name) =>
  screen.getByRole('button', { name: `Save expiry date for ${name}` });
const clearButton = (name) =>
  screen.getByRole('button', { name: `Clear expiry date for ${name}` });

describe('PantryExpiryList', () => {
  it('shows each item with its formatted date, or "No date"', () => {
    renderList();

    expect(row('egg')).toHaveTextContent('expires Nov 10, 2026');
    expect(row('butter')).toHaveTextContent('No date');
  });

  it('fills each date input with the saved date', () => {
    renderList();

    expect(dateInput('egg')).toHaveValue('2026-11-10');
    expect(dateInput('butter')).toHaveValue('');
  });

  it('saves the chosen date for that item only', async () => {
    const user = userEvent.setup();
    const { onSave } = renderList();

    await user.type(dateInput('butter'), '2026-12-01');
    await user.click(saveButton('butter'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(2, '2026-12-01');
  });

  it('saves when Enter is pressed in the date input', async () => {
    const user = userEvent.setup();
    const { onSave } = renderList();

    await user.type(dateInput('butter'), '2026-12-01{Enter}');

    expect(onSave).toHaveBeenCalledWith(2, '2026-12-01');
  });

  it('only enables Save when the date has changed', async () => {
    const user = userEvent.setup();
    renderList();

    expect(saveButton('egg')).toBeDisabled();
    expect(saveButton('butter')).toBeDisabled();

    await user.clear(dateInput('egg'));
    await user.type(dateInput('egg'), '2026-11-11');

    expect(saveButton('egg')).toBeEnabled();
  });

  it('does not offer to save an emptied input (Clear does that)', async () => {
    const user = userEvent.setup();
    renderList();

    await user.clear(dateInput('egg'));

    expect(saveButton('egg')).toBeDisabled();
  });

  it('clears a date with null and empties the input', async () => {
    const user = userEvent.setup();
    const { onSave } = renderList();

    await user.click(clearButton('egg'));

    expect(onSave).toHaveBeenCalledWith(1, null);
    expect(dateInput('egg')).toHaveValue('');
  });

  it('keeps the input when clearing fails', async () => {
    const user = userEvent.setup();
    renderList({ onSave: vi.fn().mockResolvedValue(false) });

    await user.click(clearButton('egg'));

    expect(dateInput('egg')).toHaveValue('2026-11-10');
  });

  it('offers no Clear for an item without a date', () => {
    renderList();

    expect(clearButton('butter')).toBeDisabled();
    expect(clearButton('egg')).toBeEnabled();
  });

  it('disables a row while its request is pending, and only that row', () => {
    renderList({ pendingIds: [1] });

    expect(dateInput('egg')).toBeDisabled();
    expect(clearButton('egg')).toBeDisabled();
    expect(dateInput('butter')).toBeEnabled();
  });

  it('renders nothing for an empty pantry', () => {
    renderList({ items: [] });

    expect(screen.queryByRole('list', { name: 'Expiry dates' })).not.toBeInTheDocument();
  });
});

describe('PantryExpiryList: typing a year', () => {
  // In Chrome, typing the year 2027 into a filled date input fires a change for
  // every digit: 0002, 0020, 0202, 2027. Each is a valid date, so nothing may save.
  it('does not save while the date is being typed, only on Save', async () => {
    const user = userEvent.setup();
    const { onSave } = renderList();

    for (const value of ['0002-11-10', '0020-11-10', '0202-11-10', '2027-11-10']) {
      fireEvent.change(dateInput('egg'), { target: { value } });
    }

    expect(onSave).not.toHaveBeenCalled();
    expect(dateInput('egg')).toHaveValue('2027-11-10');

    await user.click(saveButton('egg'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(1, '2027-11-10');
  });
});