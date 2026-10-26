import IngredientPicker from '../components/IngredientPicker.jsx';
import SelectedIngredients from '../components/SelectedIngredients.jsx';
import RecipeResults from '../components/RecipeResults.jsx';
import MaxMissingSelect from '../components/MaxMissingSelect.jsx'

const MAX_SELECTED = 50;

function HomePage({ search }) {
  const {
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
  } = search;

  function handleSubmit(event) {
    event.preventDefault();
    submit();
  }

  return (
    <>
      <p>Pick what you have, and see what you can cook.</p>

      {catalog.status === 'loading' && <p>Loading ingredients…</p>}

      {catalog.status === 'error' && (
        <div role="alert">
          <p>Could not load ingredients: {catalog.error}</p>
          <button type="button" onClick={catalog.retry}>
            Try again
          </button>
        </div>
      )}

      {catalog.status === 'success' && (
        <>
          <IngredientPicker
            ingredients={catalog.data}
            selectedIds={selectedIds}
            onToggle={toggle}
            maxSelected={MAX_SELECTED}
          />

          <h2>Your selection</h2>
          <SelectedIngredients
            ingredients={selected}
            onRemove={remove}
            onClear={clear}
          />

          <form onSubmit={handleSubmit}>
            <MaxMissingSelect
              id="max-missing"
              value={maxMissing}
              onChange={setMaxMissing}
            />

            <button
              type="submit"
              disabled={selectedIds.length === 0 || matches.status === 'loading'}
            >
              Find recipes
            </button>
          </form>
        </>
      )}

      <RecipeResults
        status={matches.status}
        data={matches.data}
        error={matches.error}
      />
    </>
  );
}

export default HomePage;