import { useState } from 'react';

function IngredientPicker({
  ingredients,
  selectedIds,
  onToggle,
  maxSelected = Infinity,
  pendingIds = [],
  title = "What's in your kitchen?",
}) {
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const visible = ingredients.filter((ingredient) =>
    ingredient.name.toLowerCase().includes(needle)
  );
  const atLimit = selectedIds.length >= maxSelected;

  return (
    <section aria-labelledby="picker-heading">
      <h2 id="picker-heading">{title}</h2>

      <label htmlFor="ingredient-search">Search ingredients</label>
      <input
        id="ingredient-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="e.g. egg"
      />

      {atLimit && <p>You can select up to {maxSelected} ingredients.</p>}

      {visible.length === 0 ? (
        <p>No ingredients match &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="ingredient-list">
          {visible.map((ingredient) => {
            const selected = selectedIds.includes(ingredient.id);
            const pending = pendingIds.includes(ingredient.id);

            return (
              <li key={ingredient.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={pending || (!selected && atLimit)}
                    onChange={() => onToggle(ingredient.id)}
                  />{' '}
                  {ingredient.name}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default IngredientPicker;