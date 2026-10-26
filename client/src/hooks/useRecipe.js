import { useEffect, useState } from 'react';
import { getRecipe } from '../api.js';

const LOADING = { status: 'loading', data: null, error: '', missing: false };

export function useRecipe(id) {
  const [state, setState] = useState(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await getRecipe(id, controller.signal);
        setState({ status: 'success', data, error: '', missing: false });
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        setState({
          status: 'error',
          data: null,
          error: err.message,
          missing: err.status === 404 || err.status === 400,
        });
      }
    }

    load();

    return () => controller.abort();
  }, [id, attempt]);

  function retry() {
    setState(LOADING);
    setAttempt((current) => current + 1);
  }

  return { ...state, retry };
}