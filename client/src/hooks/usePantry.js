import { useEffect, useState } from 'react';
import {
  addToPantry,
  getPantry,
  removeFromPantry,
  setPantryExpiry,
  updatePantryItem,
} from '../api.js';

// The per-item fields the server returns, with anything missing treated as null.
function pickDetails(item) {
  return {
    expiresOn: item.expiresOn ?? null,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
  };
}

export function usePantry(token) {
  const [load, setLoad] = useState({ status: 'loading', error: '' });
  const [ids, setIds] = useState([]);
  // { [ingredientId]: { expiresOn, quantity, unit } }. An id with no entry has none of them.
  const [details, setDetails] = useState({});
  const [pendingIds, setPendingIds] = useState([]);
  const [actionError, setActionError] = useState('');
  const [version, setVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPantry() {
      try {
        const items = await getPantry(token, controller.signal);
        setIds(items.map((item) => item.id));
        setDetails(Object.fromEntries(items.map((item) => [item.id, pickDetails(item)])));
        setLoad({ status: 'success', error: '' });
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        setLoad({ status: 'error', error: err.message });
      }
    }

    loadPantry();

    return () => controller.abort();
  }, [token, attempt]);

  function retry() {
    setLoad({ status: 'loading', error: '' });
    setAttempt((current) => current + 1);
  }

  // The server forgets an item's details when it's removed, so the client does too.
  function forgetDetails(id) {
    setDetails((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
  }

  async function toggle(id) {
    if (pendingIds.includes(id)) {
      return;
    }

    const wasInPantry = ids.includes(id);

    setActionError('');
    setPendingIds((current) => [...current, id]);
    setIds((current) =>
      wasInPantry ? current.filter((existing) => existing !== id) : [...current, id]
    );

    try {
      if (wasInPantry) {
        await removeFromPantry(token, id);
        forgetDetails(id);
      } else {
        await addToPantry(token, id);
      }
      setVersion((current) => current + 1);
    } catch (err) {
      if (wasInPantry && err.status === 404) {
        // Already gone on the server, which is what we wanted.
        forgetDetails(id);
        setVersion((current) => current + 1);
      } else {
        setIds((current) =>
          wasInPantry
            ? [...current, id]
            : current.filter((existing) => existing !== id)
        );
        setActionError(err.message);
      }
    } finally {
      setPendingIds((current) => current.filter((existing) => existing !== id));
    }
  }

  // Shared by every PATCH. Not optimistic: wait for the server and keep what it returns.
  // Resolves to true when saved, false when it failed (the error is in actionError).
  async function save(id, send) {
    if (pendingIds.includes(id)) {
      return false;
    }

    setActionError('');
    setPendingIds((current) => [...current, id]);

    try {
      const item = await send();
      setDetails((current) => ({ ...current, [id]: pickDetails(item) }));
      return true;
    } catch (err) {
      setActionError(err.message);
      return false;
    } finally {
      setPendingIds((current) => current.filter((existing) => existing !== id));
    }
  }

  function setExpiry(id, expiresOn) {
    return save(id, () => setPantryExpiry(token, id, expiresOn));
  }

  // changes: { expiresOn }, { quantity, unit }, or all three; null clears.
  function updateItem(id, changes) {
    return save(id, () => updatePantryItem(token, id, changes));
  }

  // Kept for the date form and the 11A tests: { [id]: "YYYY-MM-DD" | null }.
  const expiry = Object.fromEntries(
    Object.entries(details).map(([id, item]) => [id, item.expiresOn])
  );

  return {
    status: load.status,
    error: load.error,
    ids,
    details,
    expiry,
    pendingIds,
    actionError,
    version,
    toggle,
    setExpiry,
    updateItem,
    retry,
  };
}