import { useState } from "react";
import { Link } from "react-router";
import { matchesQuery } from "../search.js";

function RecipeCard({ recipe }) {
  const { title, prepMinutes, matchedCount, totalCount, missingIngredients } = recipe;
  const canMakeNow = missingIngredients.length === 0;
  const summary = `${matchedCount} of ${totalCount} ingredients`;

  return (
    <li className={canMakeNow ? 'card card-ready' : 'card'}>
      <h3>
        <Link to={`/recipes/${recipe.id}`}>{title}</Link>  
      </h3>
      <p>
        {prepMinutes != null && `${prepMinutes} min · `}
        {summary}
      </p>
      <progress max={totalCount} value={matchedCount} aria-label={summary} />
      {canMakeNow ? (
        <p>
          <strong>You can make this now.</strong>
        </p>
      ) : (
        <p>You still need: {missingIngredients.join(', ')}</p>
      )}
    </li>
  );
}

// scrollAfter: past this many recipes the list scrolls inside a frame (the Pantry page uses 8).
// searchable: show a box that filters by title or by a missing ingredient (Pantry page only).
function RecipeResults({ status, data, error, scrollAfter = Infinity, searchable = false }) {
  const [query, setQuery] = useState('');

  if (status === 'idle') {
    return null;
  }

  const visible =
    status === 'success'
      ? data.filter((recipe) => matchesQuery(query, recipe.title, ...recipe.missingIngredients))
      : [];

  return (
    <section aria-labelledby="results-heading" aria-live="polite">
      <h2 id="results-heading">Recipes you can make</h2>

      {status === 'loading' && <p className="status">Finding recipes…</p>}

      {status === 'error' && (
        <p role="alert">Could not find recipes: {error}</p>
      )}

      {status === 'success' && data.length === 0 && (
        <p className="status">No recipes match those ingredients yet. Try adding more.</p>
      )}

      {status === 'success' && data.length > 0 && (
        <>
          {searchable && (
            <div className="list-search">
              <label htmlFor="recipe-search">Search recipes</label>
              <input
                id="recipe-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. toast or cheese"
              />
            </div>
          )}

          {visible.length === 0 ? (
            <p className="status">No recipes match &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className={visible.length > scrollAfter ? 'results scroll-frame' : 'results'}>
              {visible.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
export default RecipeResults;