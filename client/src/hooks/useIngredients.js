import { useEffect, useState } from 'react';
import { getIngredients } from '../api.js';

export function useIngredients() {
  const [state, setState] = useState({ status: 'loading', data: [], error: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await getIngredients(controller.signal);
        setState({ status: 'success', data, error: '' });
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        setState({ status: 'error', data: [], error: err.message });
      }
    }

    load();

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ status: 'loading', data: [], error: '' });
    setAttempt((current) => current + 1);
  }

  return { ...state, retry };
}