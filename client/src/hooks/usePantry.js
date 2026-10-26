import { useEffect, useState } from 'react';
import { addToPantry, getPantry, removeFromPantry } from '../api.js';

export function usePantry(token) {
  const [load, setLoad] = useState({ status: 'loading', error: '' });
  const [ids, setIds] = useState([]);
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
      } else {
        await addToPantry(token, id);
      }
      setVersion((current) => current + 1);
    } catch (err) {
      if (wasInPantry && err.status === 404) {
        // Already gone on the server, which is what we wanted.
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

  return {
    status: load.status,
    error: load.error,
    ids,
    pendingIds,
    actionError,
    version,
    toggle,
    retry,
  };
}