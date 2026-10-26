import { Link } from "react-router";

function RecipeCard({ recipe }) {
  const { title, prepMinutes, matchedCount, totalCount, missingIngredients } = recipe;
  const canMakeNow = missingIngredients.length === 0;
  const summary = `${matchedCount} of ${totalCount} ingredients`;

  return (
    <li className="card">
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

function RecipeResults({ status, data, error }) {
  if (status === 'idle') {
    return null;
  }

  return (
    <section aria-labelledby="results-heading" aria-live="polite">
      <h2 id="results-heading">Recipes you can make</h2>

      {status === 'loading' && <p>Finding recipes…</p>}

      {status === 'error' && (
        <p role="alert">Could not find recipes: {error}</p>
      )}

      {status === 'success' &&
        (data.length === 0 ? (
          <p>No recipes match those ingredients yet. Try adding more.</p>
        ) : (
          <ul className="results">
            {data.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </ul>
        ))}
    </section>
  );
}

export default RecipeResults;