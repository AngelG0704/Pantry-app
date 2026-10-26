import { useEffect, useState } from 'react';
import { getMyMatches } from '../api.js';

export function useMyMatches(token, version, maxMissing) {
  const [state, setState] = useState({ status: 'loading', data: [], error: '' });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await getMyMatches(token, {
          maxMissing,
          signal: controller.signal,
        });
        setState({ status: 'success', data, error: '' });
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        setState((current) => ({
          status: 'error',
          data: current.data,
          error: err.message,
        }));
      }
    }

    load();

    return () => controller.abort();
  }, [token, version, maxMissing]);

  return state;
}