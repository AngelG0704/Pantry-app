import { useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { usePantry } from '../hooks/usePantry.js';
import { useMyMatches } from '../hooks/useMyMatches.js';
import IngredientPicker from '../components/IngredientPicker.jsx';
import SelectedIngredients from '../components/SelectedIngredients.jsx';
import MaxMissingSelect from '../components/MaxMissingSelect.jsx';
import RecipeResults from '../components/RecipeResults.jsx';

function PantryPage({ search }) {
  const { token } = useAuth();
  const { catalog } = search;

  const pantry = usePantry(token);
  const [maxMissing, setMaxMissing] = useState('');
  const matches = useMyMatches(token, pantry.version, maxMissing);

  const inPantry = catalog.data.filter((ingredient) =>
    pantry.ids.includes(ingredient.id)
  );

  const loading = catalog.status === 'loading' || pantry.status === 'loading';
  const ready = catalog.status === 'success' && pantry.status === 'success';

  return (
    <>
      <h2>My pantry</h2>

      {loading && <p>Loading your pantry…</p>}

      {catalog.status === 'error' && (
        <div role="alert">
          <p>Could not load ingredients: {catalog.error}</p>
          <button type="button" onClick={catalog.retry}>
            Try again
          </button>
        </div>
      )}

      {pantry.status === 'error' && (
        <div role="alert">
          <p>Could not load your pantry: {pantry.error}</p>
          <button type="button" onClick={pantry.retry}>
            Try again
          </button>
        </div>
      )}

      {ready && (
        <>
          {pantry.actionError && (
            <p role="alert">Could not update your pantry: {pantry.actionError}</p>
          )}

          <h3>In your pantry</h3>
          <SelectedIngredients
            ingredients={inPantry}
            onRemove={pantry.toggle}
            emptyMessage="Your pantry is empty. Tick some ingredients below."
          />

          <IngredientPicker
            title="Add or remove ingredients"
            ingredients={catalog.data}
            selectedIds={pantry.ids}
            onToggle={pantry.toggle}
            pendingIds={pantry.pendingIds}
          />

          <div className="field">
            <MaxMissingSelect
              id="pantry-max-missing"
              value={maxMissing}
              onChange={setMaxMissing}
            />
          </div>

          <RecipeResults
            status={matches.status}
            data={matches.data}
            error={matches.error}
          />
        </>
      )}
    </>
  );
}

export default PantryPage;