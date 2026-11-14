import { useRef, useState } from "react";
import { Link } from "react-router";
import { matchesQuery } from "../search.js";
import { useScrollFrame } from "../hooks/useScrollFrame.js";

// 0 -> "today", 1 -> "tomorrow", 2 -> "in 2 days".
function dayWords(daysLeft) {
  if (daysLeft === 0) {
    return 'today';
  }
  return daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
}

// "Use soon: milk (today), egg (in 2 days)" for the soon items this recipe uses, soonest
// first, then A–Z; null when it uses none. Names are matched exactly, like everywhere else.
function soonLabel(ingredients, soonItems) {
  const used = soonItems
    .filter((item) => ingredients.includes(item.name))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
  if (used.length === 0) {
    return null;
  }
  return `Use soon: ${used.map((item) => `${item.name} (${dayWords(item.daysLeft)})`).join(', ')}`;
}

function RecipeCard({ recipe, soonItems }) {
  const { title, prepMinutes, matchedCount, totalCount, missingIngredients, ingredients } = recipe;
  const canMakeNow = missingIngredients.length === 0;
  const summary = `${matchedCount} of ${totalCount} ingredients`;
  const soonText = soonLabel(ingredients, soonItems);

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
      {soonText && <p className="use-soon">{soonText}</p>}
    </li>
  );
}

// scrollAfter: past this many recipes the list scrolls inside a frame (the Pantry page uses 8).
// searchable: show a box that filters by title or by any ingredient, had or missing (Pantry page only).
// soonItems: [{ name, daysLeft }] pantry items expiring soon; cards that use one get a
// "Use soon" label (Pantry page only). It never changes the order the server sent.
function RecipeResults({
  status,
  data,
  error,
  scrollAfter = Infinity,
  searchable = false,
  soonItems = [],
}) {
  const [query, setQuery] = useState('');
  // The frame is exactly scrollAfter cards tall, however tall they are (null: CSS fallback).
  const listRef = useRef(null);
  const frameHeight = useScrollFrame(listRef, scrollAfter);

  if (status === 'idle') {
    return null;
  }

  const visible =
    status === 'success'
      ? data.filter((recipe) => matchesQuery(query, recipe.title, ...recipe.ingredients))
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
            <ul
              ref={listRef}
              className={visible.length > scrollAfter ? 'results scroll-frame' : 'results'}
              style={frameHeight === null ? undefined : { '--frame-height': `${frameHeight}px` }}
            >
              {visible.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} soonItems={soonItems} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
export default RecipeResults;