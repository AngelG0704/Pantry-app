import { useEffect, useState } from 'react';
import { addToPantry, getPantry, removeFromPantry, setPantryExpiry } from '../api.js';

export function usePantry(token) {
  const [load, setLoad] = useState({ status: 'loading', error: '' });
  const [ids, setIds] = useState([]);
  // { [ingredientId]: "YYYY-MM-DD" | null }. An id with no entry has no date.
  const [expiry, setExpiryMap] = useState({});
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
        setExpiryMap(
          Object.fromEntries(items.map((item) => [item.id, item.expiresOn ?? null]))
        );
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

  // The server forgets the date when an item is removed, so the client does too.
  function forgetExpiry(id) {
    setExpiryMap((current) => {
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
        forgetExpiry(id);
      } else {
        await addToPantry(token, id);
      }
      setVersion((current) => current + 1);
    } catch (err) {
      if (wasInPantry && err.status === 404) {
        // Already gone on the server, which is what we wanted.
        forgetExpiry(id);
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

  // Not optimistic: wait for the server and keep what it returns.
  // Resolves to true when saved, false when it failed (the error is in actionError).
  async function setExpiry(id, expiresOn) {
    if (pendingIds.includes(id)) {
      return false;
    }

    setActionError('');
    setPendingIds((current) => [...current, id]);

    try {
      const item = await setPantryExpiry(token, id, expiresOn);
      setExpiryMap((current) => ({ ...current, [id]: item.expiresOn }));
      return true;
    } catch (err) {
      setActionError(err.message);
      return false;
    } finally {
      setPendingIds((current) => current.filter((existing) => existing !== id));
    }
  }

  return {
    status: load.status,
    error: load.error,
    ids,
    expiry,
    pendingIds,
    actionError,
    version,
    toggle,
    setExpiry,
    retry,
  };
}