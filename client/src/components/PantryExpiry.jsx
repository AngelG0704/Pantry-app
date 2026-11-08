import { useState } from 'react';
import { formatExpiry } from '../dates.js';

function ExpiryRow({ item, savedDate, pending, onSave }) {
  // What's in the date input. "" means the input is empty.
  const [draft, setDraft] = useState(savedDate ?? '');
  const inputId = `expiry-${item.id}`;

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
    <li>
      <span className="expiry-name">{item.name}</span>
      <span className="expiry-status">
        {savedDate ? `expires ${formatExpiry(savedDate)}` : 'No date'}
      </span>
      <form className="expiry-form" onSubmit={handleSubmit}>
        <input
          id={inputId}
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
    </li>
  );
}

function PantryExpiryList({ items, expiry, pendingIds, onSave }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="expiry-list" aria-label="Expiry dates">
      {items.map((item) => (
        <ExpiryRow
          key={item.id}
          item={item}
          savedDate={expiry[item.id] ?? null}
          pending={pendingIds.includes(item.id)}
          onSave={onSave}
        />
      ))}
    </ul>
  );
}

export default PantryExpiryList;