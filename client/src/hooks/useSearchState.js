import { useState } from 'react';
import { useIngredients } from './useIngredients.js';
import { useRecipeMatches } from './useRecipeMatches.js';

export function useSearchState() {
  const catalog = useIngredients();
  const matches = useRecipeMatches();

  const [selectedIds, setSelectedIds] = useState([]);
  const [maxMissing, setMaxMissing] = useState('');

  const selected = catalog.data.filter((ingredient) =>
    selectedIds.includes(ingredient.id)
  );

  function toggle(id) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((existing) => existing !== id)
        : [...current, id]
    );
  }

  function remove(id) {
    setSelectedIds((current) => current.filter((existing) => existing !== id));
  }

  function clear() {
    setSelectedIds([]);
  }

  function submit() {
    matches.search(selectedIds, maxMissing);
  }

  return {
    catalog,
    matches,
    selectedIds,
    selected,
    maxMissing,
    setMaxMissing,
    toggle,
    remove,
    clear,
    submit,
  };
}