# Changelog

All notable changes to this project will be further documented in this file, see README.md
for a more broad information about this project.

## 10-22-2026
### Version 0.5.0: Accounts, authentication, and per-user pantry

Users can now register, log in, keep a personal pantry, and get recipe matches
computed from that saved pantry. Every pantry route is private to the logged-in
user.

### Added

- **`POST /api/auth/register`**: creates an account from `{ email, password }`.
- **`POST /api/auth/login`**: returns `{ token, user }` (a JWT valid for 1 hour).
- **`GET /api/auth/me`**: returns the current user (requires a token).
- **`GET /api/pantry`**: lists the caller's ingredients as `[{ id, name }]`, sorted by name.
- **`POST /api/pantry`**: adds an ingredient; body `{ "ingredientId": 1 }`.
- **`DELETE /api/pantry/:ingredientId`**: removes an ingredient from the caller's pantry.
- **`GET /api/pantry/matches`**: ranks recipes against the caller's saved pantry.
  - `maxMissing` (optional): same meaning and validation as on `/api/recipes/match`.
  - Same response fields as `/api/recipes/match`: `id`, `title`, `prepMinutes`,
    `matchedCount`, `totalCount`, `matchScore`, `missingIngredients`.
- `requireAuth` middleware (verifies the bearer token and sets `req.user.id`).
- Tables `users` and `pantry_items` in `schema.sql`.
- `recipeService.matchRecipesForUser(userId, { maxMissing })`
- `recipeController.getMatchesForMyPantry`
- Shared helpers `constants.js` (`MAX_INT`) and `utils/parseMaxMissing.js`.
- Dependencies: `bcrypt`, `jsonwebtoken`.
- Required environment variable `JWT_SECRET` (at least 32 characters).

### Behavior

- All `/api/pantry` routes require `Authorization: Bearer <token>`; without a
  valid token they return `401`.
- **Ownership comes only from the token.** No route accepts a user id from the URL
  or body, and every pantry query is scoped by the token's user id. A request
  about another user's item returns `404`, not `403`.
- `POST /api/pantry` returns `201` for a new item and `200` if it is already
  there (idempotent; nothing is duplicated). Both return `{ id, name }`.
- `DELETE /api/pantry/:ingredientId` returns `204` with no body, or `404` if the
  ingredient is not in the caller's pantry.
- `GET /api/pantry/matches` returns exactly the same ranked list as
  `GET /api/recipes/match` would for the same ingredients. An empty pantry
  returns `200` with `[]`.
- Registering an email that already exists returns `409`.
- Login returns `401 Invalid email or password` for both an unknown email and a
  wrong password (identical message by design).
- The public `GET /api/recipes/match` is unchanged and still works without login.

### Validation (returns `400` unless noted)

| Input | Rule |
|---|---|
| Register or login body missing, or `email` / `password` not strings | Both required, as strings |
| Register `email` | Trimmed and lowercased; valid format; at most 254 characters |
| Register `password` | At least 8 characters and at most 72 bytes (bcrypt limit) |
| `POST /api/pantry` `ingredientId` | A JSON integer from 1 to 2147483647 (the string `"1"` is rejected) |
| `POST /api/pantry` with an id that matches no ingredient | `400 Unknown ingredient` |
| `DELETE /api/pantry/:ingredientId` not all digits | `400` |
| `DELETE /api/pantry/:ingredientId` above 2147483647 | `404` (cannot exist) |
| `maxMissing` on `/api/pantry/matches` | Same rules as on `/api/recipes/match` |
| Missing, malformed, or expired token | `401` |

### Implementation notes

- Passwords are hashed with bcrypt (cost 12); the hash is never returned. Login
  always runs a bcrypt comparison (against a dummy hash if the email does not
  exist) so response time does not reveal which emails have accounts.
- Tokens are HS256 JWTs with the user id in `sub` and a 1-hour expiry; verification
  pins the algorithm. `config.js` refuses to start the server if `JWT_SECRET` is
  missing or shorter than 32 characters.
- Duplicate emails are caught from the database's unique-violation error (`23505`)
  rather than a select-then-insert, which avoids a race condition. The
  `users.email` column also has `CHECK (email = lower(email))`.
- `pantry_items` has primary key `(user_id, ingredient_id)`. Deleting a user
  cascades to their pantry rows; deleting an ingredient still in use is blocked.
  Adding uses `INSERT ... ON CONFLICT DO NOTHING`, and the affected row count
  decides between `201` and `200`.
- `router.use(requireAuth)` protects the whole pantry router, so a route added
  later cannot be left open by accident.
- **The matching query was refactored with no behavior change.** It is now written
  once around a `have` CTE (`WITH have AS (...)`), fed by two constant sources:
  `unnest($1::int[])` for `/api/recipes/match` and the user's `pantry_items` rows
  for `/api/pantry/matches`. The user filter lives inside the CTE; putting it in a
  `WHERE` clause would silently turn the `LEFT JOIN` into an inner join. The SQL
  fragments are constants written in code, and request values still travel only
  as parameters (`$1`, `$2`).
- `maxMissing` validation moved to `utils/parseMaxMissing.js`, and `MAX_INT` to
  `constants.js`, removing duplicated copies in the controllers.
- To upgrade from 0.4.0: run `npm install`, add `JWT_SECRET` to `.env`, run
  `npm run db:seed` (idempotent; creates the new tables without dropping data),
  and restart the server.

### Example

```powershell
$body = @{ email = "racc@example.com"; password = "correct horse battery" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/register -ContentType "application/json" -Body $body

$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body $body
$headers = @{ Authorization = "Bearer $($login.token)" }

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/pantry -Headers $headers -ContentType "application/json" -Body '{"ingredientId":1}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/pantry -Headers $headers -ContentType "application/json" -Body '{"ingredientId":2}'

Invoke-RestMethod -Uri "http://localhost:3000/api/pantry/matches?maxMissing=1" -Headers $headers
```

With egg and butter in the pantry, the last call returns:

```json
[
  {
    "id": 1,
    "title": "Scrambled eggs",
    "prepMinutes": 5,
    "matchedCount": 2,
    "totalCount": 2,
    "matchScore": 1,
    "missingIngredients": []
  },
  {
    "id": 5,
    "title": "Cheese omelette",
    "prepMinutes": 10,
    "matchedCount": 2,
    "totalCount": 3,
    "matchScore": 0.67,
    "missingIngredients": ["cheese"]
  }
]
```

### Files changed

- `src/db/schema.sql`: added `users` and `pantry_items`
- `src/config.js`, `src/constants.js`, `src/utils/parseMaxMissing.js`: new
- `src/middleware/requireAuth.js`: new
- `src/services/authService.js`, `tokenService.js`, `pantryService.js`: new
- `src/services/recipeService.js`: matching refactored; added `matchRecipesForUser`
- `src/controllers/authController.js`, `pantryController.js`: new
- `src/controllers/recipeController.js`: uses shared helpers; added `getMatchesForMyPantry`
- `src/routes/auth.js`, `src/routes/pantry.js`: new
- `src/app.js`: mounted `/api/auth` and `/api/pantry`

### Known limitations

- No HTTPS enforcement yet (production deployment phase); passwords and tokens are
  only safe over HTTPS.
- No rate limiting or lockout on `/login` (planned: Phase 6b).
- Tokens cannot be revoked before they expire, and there is no refresh token or
  logout flow (planned: Phase 7c).
- No password reset, email verification, or account deletion.
- The pantry stores only presence (no quantities or expiry dates) and has no
  bulk-add endpoint.
- Input validation is still hand-written (planned: schema validation in Phase 6b).
- The `X-Powered-By` header is still sent, and CORS and security headers are not
  configured (planned: Phase 6b).
- No automated test suite yet (planned: Phase 6a); verification is via the
  Postman collection.





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