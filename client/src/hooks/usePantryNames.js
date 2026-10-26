import { useEffect, useState } from 'react';
import { getPantry } from '../api.js';

export function usePantryNames(token) {
  const [loaded, setLoaded] = useState({ token: null, names: null });

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const controller = new AbortController();

    getPantry(token, controller.signal)
      .then((items) => {
        setLoaded({ token, names: new Set(items.map((item) => item.name)) });
      })
      .catch(() => {
        // The marks are a convenience; if the lookup fails, the page still works.
      });

    return () => controller.abort();
  }, [token]);

  return loaded.token === token ? loaded.names : null;
}