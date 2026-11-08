import { useEffect, useRef, useState } from 'react';
import { formatExpiry } from '../dates.js';
import { UNITS, formatAmount, parseQuantity } from '../units.js';

const NO_DETAILS = { expiresOn: null, quantity: null, unit: null };

function DateForm({ item, savedDate, pending, onSave }) {
  // What's in the date input. "" means the input is empty.
  const [draft, setDraft] = useState(savedDate ?? '');

  async function handleSubmit(event) {
    event.preventDefault();
    await onSave(item.id, draft);
  }

  async function handleClear() {
    const saved = await onSave(item.id, null);
    if (saved) {
      setDraft('');
    }
  }

  // Save only a real change; an empty input is cleared with Clear, not saved.
  const canSave = !pending && draft !== '' && draft !== (savedDate ?? '');
  const canClear = !pending && savedDate !== null;

  return (
    <form className="expiry-form" onSubmit={handleSubmit}>
      <input
        id={`expiry-${item.id}`}
        type="date"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={pending}
        aria-label={`Expiry date for ${item.name}`}
      />
      <button
        type="submit"
        disabled={!canSave}
        aria-label={`Save expiry date for ${item.name}`}
      >
        Save
      </button>
      <button
        type="button"
        onClick={handleClear}
        disabled={!canClear}
        aria-label={`Clear expiry date for ${item.name}`}
      >
        Clear
      </button>
    </form>
  );
}

function AmountForm({ item, savedQuantity, savedUnit, pending, onSave }) {
  // A number input's value is a string; "" while it's empty or partly typed.
  const [quantityDraft, setQuantityDraft] = useState(
    savedQuantity === null ? '' : String(savedQuantity)
  );
  const [unitDraft, setUnitDraft] = useState(savedUnit ?? '');

  const quantity = parseQuantity(quantityDraft);
  const changed = quantity !== savedQuantity || unitDraft !== (savedUnit ?? '');

  async function handleSubmit(event) {
    event.preventDefault();
    // quantity is a number here (parseQuantity), never the input's string.
    await onSave(item.id, { quantity, unit: unitDraft });
  }

  async function handleClear() {
    const saved = await onSave(item.id, { quantity: null, unit: null });
    if (saved) {
      setQuantityDraft('');
      setUnitDraft('');
    }
  }

  // Both halves valid, and something actually changed.
  const canSave = !pending && quantity !== null && unitDraft !== '' && changed;
  const canClear = !pending && savedQuantity !== null;

  return (
    <form className="expiry-form" onSubmit={handleSubmit}>
      <input
        id={`quantity-${item.id}`}
        type="number"
        inputMode="decimal"
        min="0.001"
        step="0.001"
        value={quantityDraft}
        onChange={(event) => setQuantityDraft(event.target.value)}
        disabled={pending}
        aria-label={`Quantity for ${item.name}`}
      />
      <select
        id={`unit-${item.id}`}
        value={unitDraft}
        onChange={(event) => setUnitDraft(event.target.value)}
        disabled={pending}
        aria-label={`Unit for ${item.name}`}
      >
        <option value="">Unit</option>
        {UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
      <span className="expiry-actions">
        <button
          type="submit"
          disabled={!canSave}
          aria-label={`Save amount for ${item.name}`}
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={!canClear}
          aria-label={`Clear amount for ${item.name}`}
        >
          Clear
        </button>
      </span>
    </form>
  );
}

// Two steps so one slip can't delete an item's saved amount and date.
// It stays one button (only its words change), so keyboard focus stays on it.
function RemoveControl({ item, pending, onRemove }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <span className="expiry-actions expiry-remove-group">
      <button
        type="button"
        className={confirming ? 'expiry-remove expiry-remove-confirm' : 'expiry-remove'}
        disabled={pending}
        aria-label={confirming ? `Confirm removing ${item.name}` : `Remove ${item.name} from pantry`}
        onClick={() => (confirming ? onRemove(item.id) : setConfirming(true))}
      >
        {confirming ? 'Confirm remove' : 'Remove'}
      </button>
      {confirming && (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          aria-label={`Cancel removing ${item.name}`}
        >
          Cancel
        </button>
      )}
    </span>
  );
}

function DetailsRow({ item, savedDate, saved, pending, onSave, onSaveAmount, onRemove }) {
  // Collapsed by default so a big pantry stays one line per item.
  // Closing unmounts the forms, which throws away unsaved drafts (and a pending "Confirm remove").
  const [open, setOpen] = useState(false);
  const formsRef = useRef(null);
  const formsId = `details-${item.id}`;

  // Inside a scrolling list, an opened row near the bottom would hide its forms.
  // (jsdom has no scrollIntoView, hence the ?.)
  useEffect(() => {
    if (open) {
      formsRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [open]);

  const amountText =
    saved.quantity === null ? 'No amount' : formatAmount(saved.quantity, saved.unit);
  const dateText = savedDate ? `expires ${formatExpiry(savedDate)}` : 'No date';

  return (
    <li>
      <span className="expiry-name">{item.name}</span>
      <span className="expiry-status">
        <span>{amountText}</span> · <span>{dateText}</span>
      </span>
      <button
        type="button"
        className="expiry-toggle"
        aria-expanded={open}
        aria-controls={formsId}
        aria-label={`${open ? 'Close' : 'Edit'} ${item.name}`}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? 'Close' : 'Edit'}
      </button>
      {open && (
        <div className="expiry-forms" id={formsId} ref={formsRef}>
          <DateForm item={item} savedDate={savedDate} pending={pending} onSave={onSave} />
          <AmountForm
            item={item}
            savedQuantity={saved.quantity}
            savedUnit={saved.unit}
            pending={pending}
            onSave={onSaveAmount}
          />
          <RemoveControl item={item} pending={pending} onRemove={onRemove} />
        </div>
      )}
    </li>
  );
}

function PantryExpiryList({
  items,
  expiry,
  details = {},
  pendingIds,
  onSave,
  onSaveAmount,
  onRemove,
  // Past this many rows the list scrolls inside a frame instead of growing the page.
  scrollAfter = Infinity,
}) {
  if (items.length === 0) {
    return null;
  }

  const className = items.length > scrollAfter ? 'expiry-list scroll-frame' : 'expiry-list';

  return (
    <ul className={className} aria-label="In your pantry">
      {items.map((item) => (
        <DetailsRow
          key={item.id}
          item={item}
          savedDate={expiry[item.id] ?? null}
          saved={details[item.id] ?? NO_DETAILS}
          pending={pendingIds.includes(item.id)}
          onSave={onSave}
          onSaveAmount={onSaveAmount}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

export default PantryExpiryList;