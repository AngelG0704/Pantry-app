import { useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { usePantry } from '../hooks/usePantry.js';
import { useMyMatches } from '../hooks/useMyMatches.js';
import IngredientPicker from '../components/IngredientPicker.jsx';
import MaxMissingSelect from '../components/MaxMissingSelect.jsx';
import RecipeResults from '../components/RecipeResults.jsx';
import PantryExpiryList from '../components/PantryExpiryList.jsx';
import PantrySortSelect from '../components/PantrySortSelect.jsx';
import { matchesQuery } from '../search.js';
import { todayLocal } from '../dates.js';
import { DEFAULT_SORT, sortPantry } from '../sort.js';

// Both lists on this page scroll inside a frame once they pass this many items.
const SCROLL_AFTER = 8;

function PantryPage({ search }) {
  const { token } = useAuth();
  const { catalog } = search;

  const pantry = usePantry(token);
  const [maxMissing, setMaxMissing] = useState('');
  const [pantryQuery, setPantryQuery] = useState('');
  // Not remembered: every visit starts on the default.
  const [sortKey, setSortKey] = useState(DEFAULT_SORT);
  const matches = useMyMatches(token, pantry.version, maxMissing);

  const inPantry = catalog.data.filter((ingredient) =>
    pantry.ids.includes(ingredient.id)
  );

  const visiblePantry = inPantry.filter((ingredient) =>
    matchesQuery(pantryQuery, ingredient.name)
  );

  // Filter first, then sort what is left.
  const sortedPantry = sortPantry(visiblePantry, pantry.details, sortKey);

  const loading = catalog.status === 'loading' || pantry.status === 'loading';
  const ready = catalog.status === 'success' && pantry.status === 'success';

  return (
    <>
      <h2>My pantry</h2>

      {loading && <p className='status'>Loading your pantry…</p>}

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
          {inPantry.length === 0 ? (
            <p className="status">Your pantry is empty. Tick some ingredients below.</p>
          ) : (
            <>
              <div className="list-search">
                <label htmlFor="pantry-search">Search your pantry</label>
                <input
                  id="pantry-search"
                  type="search"
                  value={pantryQuery}
                  onChange={(event) => setPantryQuery(event.target.value)}
                  placeholder="e.g. egg"
                />
                <PantrySortSelect id="pantry-sort" value={sortKey} onChange={setSortKey} />
              </div>
              {visiblePantry.length === 0 ? (
                <p className="status">No pantry items match &ldquo;{pantryQuery}&rdquo;.</p>
              ) : (
                <PantryExpiryList
                  items={sortedPantry}
                  expiry={pantry.expiry}
                  details={pantry.details}
                  // Read on every render: past midnight it updates on the next re-render only.
                  today={todayLocal()}
                  pendingIds={pantry.pendingIds}
                  onSave={pantry.setExpiry}
                  onSaveAmount={pantry.updateItem}
                  onRemove={pantry.toggle}
                  scrollAfter={SCROLL_AFTER}
                />
              )}
            </>
          )}

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
            scrollAfter={SCROLL_AFTER}
            searchable
          />
        </>
      )}
    </>
  );
}

export default PantryPage;