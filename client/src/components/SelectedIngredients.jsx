function SelectedIngredients({
  ingredients,
  onRemove,
  onClear,
  emptyMessage = 'Nothing selected yet.',
}) {
  if (ingredients.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div>
      <ul className="chips" aria-label="Selected ingredients">
        {ingredients.map((ingredient) => (
          <li key={ingredient.id}>
            {ingredient.name}
            <button
              type="button"
              onClick={() => onRemove(ingredient.id)}
              aria-label={`Remove ${ingredient.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {onClear && (
        <button type="button" onClick={onClear}>
          Clear all
        </button>
      )}
    </div>
  );
}

export default SelectedIngredients;