import { useEffect, useRef, useState } from 'react';
import { matchRecipes } from '../api.js';

export function useRecipeMatches() {
  const [state, setState] = useState({ status: 'idle', data: [], error: '' });
  const controllerRef = useRef(null);

  async function search(ingredientIds, maxMissing) {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ status: 'loading', data: [], error: '' });

    try {
      const data = await matchRecipes(ingredientIds, {
        maxMissing,
        signal: controller.signal,
      });
      setState({ status: 'success', data, error: '' });
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      setState({ status: 'error', data: [], error: err.message });
    }
  }

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  return { ...state, search };
}