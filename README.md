The goal of this project is to create a full-stack application that allows the user to come up with ways to create food with ingredients they have in their kitchen


## 10-19-2026
### Version 0.4.0: Recipe matching

Recipes can now be ranked by how many of their ingredients a user has, with the
missing ingredients listed for each result.

### added

- **`GET /api/recipes/match`**: ranks recipes against a set of ingredient ids.
  - `ingredients` (required): comma-separated ingredient ids, e.g. `?ingredients=1,2,3`
  - `maxMissing` (optional): non-negative integer; only return recipes missing at
    most this many ingredients (`0` = recipes you can make right now). Omitted means no limit.
- **Response fields** per recipe: `id`, `title`, `prepMinutes`, `matchedCount`,
  `totalCount`, `matchScore` (0 to 1, two decimals), `missingIngredients`
  (alphabetical list of names; always an array, empty when nothing is missing).
- `recipeService.matchRecipes(ingredientIds, { maxMissing })`
- `recipeController.getRecipeMatches`

### Behavior

- **Ranking:** `matchScore` descending, then `matchedCount` descending, then title
  ascending, so the order is deterministic.
- Recipes with zero matching ingredients are excluded.
- A well-formed request that matches nothing returns `200` with `[]` (not a 404).
- Duplicate ids in `ingredients` are ignored (`1,1,2` is the same as `1,2`).
- `maxMissing` is backward compatible: requests without it behave as before.

### Validation (returns `400`)

| Input | Rule |
|---|---|
| `ingredients` missing, empty, or repeated | Must be a single non-empty value |
| `ingredients` contains non-digits or empty items (`abc`, `1,,2`) | Comma-separated non-negative integers only |
| More than 50 unique ids | Maximum 50 |
| Any id above 2147483647 | Exceeds the database `INT` range |
| `maxMissing` negative, decimal, empty, repeated, or above 2147483647 | Non-negative integer within `INT` range |

### Implementation notes

- One SQL query does the work: a `LEFT JOIN` against `unnest($1::int[])` keeps every
  recipe ingredient, with `NULL` marking ones the user lacks. `COUNT(*)` gives the
  total, `COUNT(have.ingredient_id)` gives the matches, and
  `ARRAY_AGG(...) FILTER (WHERE have.ingredient_id IS NULL)` collects the missing names.
- `HAVING` filters on the aggregates (at least one match; within `maxMissing`).
- `maxMissing` is passed as a parameter (`$2`), where `NULL` means "no limit", so
  the query text stays constant and user input never enters the SQL string.
- `COALESCE(..., '{}')` guarantees `missingIngredients` is `[]` rather than `null`.
- `COUNT` results are cast to `int`/`float` in SQL, since `pg` returns `bigint`
  and `numeric` values as strings.
- The `/match` route is registered **before** `/:id` in `routes/recipes.js`;
  otherwise `/:id` would capture the word "match".
- Only the service layer changed between 4a and 4b: the controller and route were
  untouched by the missing-ingredients feature.

### Files changed

- `src/services/recipeService.js`: added `matchRecipes`
- `src/controllers/recipeController.js`: added `getRecipeMatches`, `MAX_MATCH_IDS`
- `src/routes/recipes.js`: added `GET /match` (ahead of `GET /:id`)

### Known limitations

- Matching takes ingredient ids in the request. It does not yet read a saved
  per-user pantry (planned for Phase 5c).
- Input validation is hand-written and repeated across controllers (planned to be
  replaced with schema validation in Phase 6b).
- Ingredient names are matched exactly; there are no synonyms or quantities.
