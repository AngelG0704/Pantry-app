import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PantryExpiryList from './PantryExpiryList.jsx';
import { UNITS } from '../units.js';

const EGG = { id: 1, name: 'egg' };
const BUTTER = { id: 2, name: 'butter' };

function renderList({
  items = [EGG, BUTTER],
  expiry = { 1: '2026-11-10', 2: null },
  details = {},
  pendingIds = [],
  onSave = vi.fn().mockResolvedValue(true),
  onSaveAmount = vi.fn().mockResolvedValue(true),
  onRemove = vi.fn(),
  scrollAfter,
  // Nine days before egg's date: egg is "ok", so tests that aren't about badges see none.
  today = '2026-11-01',
  // Rows start collapsed; most tests are about the forms, so open them unless told not to.
  open = items.map((item) => item.name),
} = {}) {
  render(
    <PantryExpiryList
      items={items}
      expiry={expiry}
      details={details}
      today={today}
      pendingIds={pendingIds}
      onSave={onSave}
      onSaveAmount={onSaveAmount}
      onRemove={onRemove}
      scrollAfter={scrollAfter}
    />
  );
  for (const name of open) {
    fireEvent.click(screen.getByRole('button', { name: `Edit ${name}` }));
  }
  return { onSave, onSaveAmount, onRemove };
}

const row = (name) =>
  within(screen.getByRole('list', { name: 'In your pantry' }))
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

    expect(screen.queryByRole('list', { name: 'In your pantry' })).not.toBeInTheDocument();
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

describe('PantryExpiryList: amounts', () => {
  const DETAILS = {
    1: { expiresOn: '2026-11-10', quantity: 6, unit: 'piece' },
    2: { expiresOn: null, quantity: null, unit: null },
  };

  const quantityInput = (name) => screen.getByLabelText(`Quantity for ${name}`);
  const unitSelect = (name) => screen.getByLabelText(`Unit for ${name}`);
  const saveAmount = (name) =>
    screen.getByRole('button', { name: `Save amount for ${name}` });
  const clearAmount = (name) =>
    screen.getByRole('button', { name: `Clear amount for ${name}` });

  it('shows the amount and the date together, or says what is missing', () => {
    renderList({ details: DETAILS });

    expect(row('egg')).toHaveTextContent('6 pieces · expires Nov 10, 2026');
    expect(row('butter')).toHaveTextContent('No amount · No date');
  });

  it('fills the inputs with the saved amount', () => {
    renderList({ details: DETAILS });

    expect(quantityInput('egg')).toHaveValue(6);
    expect(unitSelect('egg')).toHaveValue('piece');
    expect(quantityInput('butter')).toHaveValue(null);
    expect(unitSelect('butter')).toHaveValue('');
  });

  it('offers every unit, plus an empty choice', () => {
    renderList({ details: DETAILS });

    const options = within(unitSelect('butter'))
      .getAllByRole('option')
      .map((option) => option.value);
    expect(options).toEqual(['', ...UNITS]);
  });

  it('uses a decimal step, so the browser allows 1.5', () => {
    renderList({ details: DETAILS });

    expect(quantityInput('egg')).toHaveAttribute('step', '0.001');
    expect(quantityInput('egg')).toHaveAttribute('min', '0.001');
  });

  it('saves the amount as a number with its unit, for that item only', async () => {
    const user = userEvent.setup();
    const { onSaveAmount, onSave } = renderList({ details: DETAILS });

    await user.type(quantityInput('butter'), '1.5');
    await user.selectOptions(unitSelect('butter'), 'cup');
    await user.click(saveAmount('butter'));

    expect(onSaveAmount).toHaveBeenCalledTimes(1);
    expect(onSaveAmount).toHaveBeenCalledWith(2, { quantity: 1.5, unit: 'cup' });
    expect(typeof onSaveAmount.mock.calls[0][1].quantity).toBe('number');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves when Enter is pressed in the quantity input', async () => {
    const user = userEvent.setup();
    const { onSaveAmount } = renderList({ details: DETAILS });

    await user.selectOptions(unitSelect('butter'), 'g');
    await user.type(quantityInput('butter'), '500{Enter}');

    expect(onSaveAmount).toHaveBeenCalledWith(2, { quantity: 500, unit: 'g' });
  });

  it('needs both a valid quantity and a unit before Save is enabled', async () => {
    const user = userEvent.setup();
    renderList({ details: DETAILS });

    expect(saveAmount('butter')).toBeDisabled();

    await user.type(quantityInput('butter'), '2');
    expect(saveAmount('butter')).toBeDisabled();

    await user.selectOptions(unitSelect('butter'), 'cup');
    expect(saveAmount('butter')).toBeEnabled();
  });

  for (const [name, typed] of [
    ['zero', '0'],
    ['more than 3 decimal places', '1.2345'],
  ]) {
    it(`does not offer to save ${name}`, async () => {
      const user = userEvent.setup();
      renderList({ details: DETAILS });

      await user.selectOptions(unitSelect('butter'), 'cup');
      await user.type(quantityInput('butter'), typed);

      expect(saveAmount('butter')).toBeDisabled();
    });
  }

  it('only enables Save when the amount has changed', async () => {
    const user = userEvent.setup();
    renderList({ details: DETAILS });

    expect(saveAmount('egg')).toBeDisabled();

    await user.selectOptions(unitSelect('egg'), 'g');
    expect(saveAmount('egg')).toBeEnabled();

    await user.selectOptions(unitSelect('egg'), 'piece');
    expect(saveAmount('egg')).toBeDisabled();
  });

  it('clears the amount with two nulls and empties the inputs', async () => {
    const user = userEvent.setup();
    const { onSaveAmount } = renderList({ details: DETAILS });

    await user.click(clearAmount('egg'));

    expect(onSaveAmount).toHaveBeenCalledWith(1, { quantity: null, unit: null });
    expect(quantityInput('egg')).toHaveValue(null);
    expect(unitSelect('egg')).toHaveValue('');
  });

  it('keeps the inputs when clearing fails', async () => {
    const user = userEvent.setup();
    renderList({ details: DETAILS, onSaveAmount: vi.fn().mockResolvedValue(false) });

    await user.click(clearAmount('egg'));

    expect(quantityInput('egg')).toHaveValue(6);
    expect(unitSelect('egg')).toHaveValue('piece');
  });

  it('offers no Clear for an item without an amount', () => {
    renderList({ details: DETAILS });

    expect(clearAmount('butter')).toBeDisabled();
    expect(clearAmount('egg')).toBeEnabled();
  });

  it('disables the amount form too while the row is pending', () => {
    renderList({ details: DETAILS, pendingIds: [1] });

    expect(quantityInput('egg')).toBeDisabled();
    expect(unitSelect('egg')).toBeDisabled();
    expect(clearAmount('egg')).toBeDisabled();
    expect(quantityInput('butter')).toBeEnabled();
  });
});

describe('PantryExpiryList: collapsing', () => {
  const DETAILS = {
    1: { expiresOn: '2026-11-10', quantity: 6, unit: 'piece' },
    2: { expiresOn: null, quantity: null, unit: null },
  };

  it('starts with every row collapsed: name, status, and an Edit button only', () => {
    renderList({ details: DETAILS, open: [] });

    expect(row('egg')).toHaveTextContent('6 pieces · expires Nov 10, 2026');
    expect(screen.queryByLabelText('Expiry date for egg')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity for egg')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit egg' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('opens one row without opening the others', async () => {
    const user = userEvent.setup();
    renderList({ details: DETAILS, open: [] });

    await user.click(screen.getByRole('button', { name: 'Edit egg' }));

    expect(screen.getByLabelText('Expiry date for egg')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity for egg')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity for butter')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Close egg' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).toContainElement(
      screen.getByLabelText('Quantity for egg')
    );
  });

  it('closes again, and throws away what was typed but not saved', async () => {
    const user = userEvent.setup();
    const { onSaveAmount } = renderList({ details: DETAILS, open: ['egg'] });

    await user.clear(screen.getByLabelText('Quantity for egg'));
    await user.type(screen.getByLabelText('Quantity for egg'), '12');
    await user.click(screen.getByRole('button', { name: 'Close egg' }));
    await user.click(screen.getByRole('button', { name: 'Edit egg' }));

    expect(screen.getByLabelText('Quantity for egg')).toHaveValue(6);
    expect(onSaveAmount).not.toHaveBeenCalled();
  });

  it('stays open after a save, so the result is visible next to the form', async () => {
    const user = userEvent.setup();
    renderList({ details: DETAILS, open: ['butter'] });

    await user.type(screen.getByLabelText('Quantity for butter'), '2');
    await user.selectOptions(screen.getByLabelText('Unit for butter'), 'cup');
    await user.click(screen.getByRole('button', { name: 'Save amount for butter' }));

    expect(screen.getByLabelText('Quantity for butter')).toBeInTheDocument();
  });
});

describe('PantryExpiryList: removing', () => {
  const removeButton = (name) =>
    screen.getByRole('button', { name: `Remove ${name} from pantry` });

  it('only offers Remove inside an open row', () => {
    renderList({ open: [] });

    expect(
      screen.queryByRole('button', { name: 'Remove egg from pantry' })
    ).not.toBeInTheDocument();
  });

  it('asks for a second click before removing', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderList({ open: ['egg'] });

    await user.click(removeButton('egg'));

    expect(onRemove).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Confirm removing egg' });
    expect(confirm).toHaveTextContent('Confirm remove');
    expect(confirm).toHaveFocus();

    await user.click(confirm);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('goes back to a plain Remove on Cancel', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderList({ open: ['egg'] });

    await user.click(removeButton('egg'));
    await user.click(screen.getByRole('button', { name: 'Cancel removing egg' }));

    expect(removeButton('egg')).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('forgets a half-finished removal when the row is closed', async () => {
    const user = userEvent.setup();
    renderList({ open: ['egg'] });

    await user.click(removeButton('egg'));
    await user.click(screen.getByRole('button', { name: 'Close egg' }));
    await user.click(screen.getByRole('button', { name: 'Edit egg' }));

    expect(removeButton('egg')).toBeInTheDocument();
  });

  it('cannot remove while the row has a request in flight', () => {
    renderList({ open: ['egg'], pendingIds: [1] });

    expect(removeButton('egg')).toBeDisabled();
  });
});

describe('PantryExpiryList: expiry badges', () => {
  // With today = Nov 10: Nov 9 is expired, Nov 10 (today) and Nov 13 (day 3) are soon,
  // Nov 14 (day 4) is ok. dates.test.js covers every boundary; this checks the display.
  const TODAY = '2026-11-10';
  const MILK = { id: 3, name: 'milk' };
  const FLOUR = { id: 4, name: 'flour' };
  const ITEMS = [EGG, BUTTER, MILK, FLOUR];
  const EXPIRY = { 1: '2026-11-09', 2: '2026-11-10', 3: '2026-11-14', 4: null };
  const DETAILS = {
    1: { expiresOn: '2026-11-09', quantity: 6, unit: 'piece' },
    2: { expiresOn: '2026-11-10', quantity: null, unit: null },
    3: { expiresOn: '2026-11-14', quantity: 1, unit: 'l' },
    4: { expiresOn: null, quantity: null, unit: null },
  };

  const renderBadges = (overrides = {}) =>
    renderList({
      items: ITEMS,
      expiry: EXPIRY,
      details: DETAILS,
      today: TODAY,
      open: [],
      ...overrides,
    });

  it('puts "Expired" or "Soon" between the amount and the date', () => {
    renderBadges();

    expect(row('egg')).toHaveTextContent('6 pieces · Expired · expires Nov 9, 2026');
    expect(row('butter')).toHaveTextContent('No amount · Soon · expires Nov 10, 2026');
  });

  it('shows no badge for a date further off, or for no date', () => {
    renderBadges();

    expect(row('milk')).toHaveTextContent('1 l · expires Nov 14, 2026');
    expect(row('flour')).toHaveTextContent('No amount · No date');
    for (const name of ['milk', 'flour']) {
      expect(row(name)).not.toHaveTextContent(/Expired|Soon/);
    }
  });

  it('marks the row itself, so it can be highlighted', () => {
    renderBadges();

    expect(row('egg')).toHaveClass('expiry-row--expired');
    expect(row('egg')).not.toHaveClass('expiry-row--soon');
    expect(row('butter')).toHaveClass('expiry-row--soon');
    expect(row('butter')).not.toHaveClass('expiry-row--expired');
    for (const name of ['milk', 'flour']) {
      expect(row(name).className).not.toMatch(/expiry-row--/);
    }
  });

  it('decides the badge from the today it is given, not from the clock', () => {
    // Butter expires Nov 10 in every render; only today changes.
    const cases = [
      ['2026-11-06', null],
      ['2026-11-07', 'Soon'],
      ['2026-11-10', 'Soon'],
      ['2026-11-11', 'Expired'],
    ];
    for (const [today, badge] of cases) {
      const { unmount } = render(
        <PantryExpiryList
          items={[BUTTER]}
          expiry={{ 2: '2026-11-10' }}
          today={today}
          pendingIds={[]}
        />
      );
      const status = row('butter').querySelector('.expiry-status');
      if (badge === null) {
        expect(status, `today ${today}`).toHaveTextContent('No amount · expires Nov 10, 2026');
      } else {
        expect(status, `today ${today}`).toHaveTextContent(
          `No amount · ${badge} · expires Nov 10, 2026`
        );
      }
      unmount();
    }
  });
});

describe('PantryExpiryList: long lists', () => {
  const list = () => screen.getByRole('list', { name: 'In your pantry' });

  it('scrolls inside a frame only when there are more rows than scrollAfter', () => {
    const { unmount } = render(
      <PantryExpiryList
        items={[EGG, BUTTER]}
        expiry={{}}
        pendingIds={[]}
        scrollAfter={2}
      />
    );
    expect(list()).not.toHaveClass('scroll-frame');
    unmount();

    renderList({ items: [EGG, BUTTER, { id: 3, name: 'flour' }], scrollAfter: 2, open: [] });
    expect(list()).toHaveClass('scroll-frame');
  });

  it('never scrolls when no limit is given', () => {
    renderList({ open: [] });

    expect(list()).not.toHaveClass('scroll-frame');
  });
});