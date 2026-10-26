import { Link, useParams } from 'react-router';
import { useRecipe } from '../hooks/useRecipe.js';
import { useAuth } from '../auth/useAuth.js';
import { usePantryNames } from '../hooks/usePantryNames.js';

function RecipeDetail({ id, selectedNames }) {
  const recipe = useRecipe(id);

  if (recipe.status === 'loading') {
    return <p>Loading recipe…</p>;
  }

  if (recipe.status === 'error') {
    return (
      <div role="alert">
        {recipe.missing ? (
          <p>We couldn&apos;t find that recipe.</p>
        ) : (
          <>
            <p>Could not load the recipe: {recipe.error}</p>
            <button type="button" onClick={recipe.retry}>
              Try again
            </button>
          </>
        )}
        <p>
          <Link to="/">← Back to your ingredients</Link>
        </p>
      </div>
    );
  }

  const { data } = recipe;
  const showMarks = selectedNames.size > 0;

  return (
    <article>
      <p>
        <Link to="/">← Back to your ingredients</Link>
      </p>

      <h2>{data.title}</h2>
      {data.prepMinutes != null && <p>{data.prepMinutes} minutes</p>}

      <h3>Ingredients</h3>
      <ul className="recipe-ingredients">
        {data.ingredients.map((name) => (
          <li key={name}>
            {name}
            {showMarks &&
              (selectedNames.has(name)
                ? ' ✓ you have this'
                : ' — you need this')}
          </li>
        ))}
      </ul>

      <h3>Instructions</h3>
      <p className="instructions">{data.instructions}</p>
    </article>
  );
}

function RecipePage({ search }) {
  const { id } = useParams();
  const { token } = useAuth();
  const pantryNames = usePantryNames(token);

  const typedNames = new Set(
    search.selected.map((ingredient) => ingredient.name)
  );

  return (
    <RecipeDetail key={id} id={id} selectedNames={pantryNames ?? typedNames} />
  );
}

export default RecipePage;