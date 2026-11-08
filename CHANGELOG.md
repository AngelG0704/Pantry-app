# Changelog

All notable changes to this project will be further documented in this file, see README.md
for a more broad information about this project.

## 11-07-2026
### Version 1.5.0: Pantry quantities (in progress)

Each pantry item can now have an optional amount, a quantity with a unit. This entry
covers the server part (11B-1); the web app part follows in 11B-2.

### Added

- **Migration `003_pantry_quantity.sql`:** nullable `quantity NUMERIC(10, 3)` and
  `unit TEXT` on `pantry_items`, with named checks: `quantity > 0`, a unit from
  `g, kg, ml, l, tsp, tbsp, cup, oz, lb, piece`, and both set or both null. Applied on
  the 11-07-2026 deploy; Neon was backed up first (`neon-2026-11-07-before-003.dump`).
- **Amounts in the API:** `GET /api/pantry` items are now
  `{ id, name, expiresOn, quantity, unit }`. `quantity` is a JSON number or `null`.
- **36 server tests** (160 → 196), including exact numbers such as `1.005` and
  `9999999.999`, and every unit sent through the database check.

### Changed

- **`PATCH /api/pantry/:ingredientId` is a partial update.** A key left out is
  unchanged, `null` clears, and `quantity` and `unit` are sent together:

      { "quantity": 2, "unit": "cup" }
      { "quantity": null, "unit": null }
      { "expiresOn": "2026-12-01", "quantity": 6, "unit": "piece" }

  `400` for an empty body, half a pair, a quantity that is ≤ 0, has more than 3 decimal
  places, is a string, or is 10,000,000 or more, an unknown or wrong-case unit, and any
  other key. A missing `expiresOn` is no longer an error: it means "leave the date
  alone". The 1.4.0 web app, which sends only `{ "expiresOn": ... }`, is unaffected.

### Notes

- node-postgres returns `NUMERIC` as a string (`"1.500"`), so the query converts it
  with `::float8`. At 3 decimal places and under 10 million, every value round-trips
  exactly.
- Postgres silently rounds extra decimals (`1.23456` → `1.235`), so the API rejects
  more than 3 instead. The check reads the number's text, because
  `1.005 * 1000` is `1004.9999999999999` in floating point.
- The unit list exists in two places, the zod schema and the migration's check. A test
  sends every unit through the database, so they can't silently differ. Adding a unit
  needs a new migration as well as the code change.

## 11-04-2026
### Version 1.4.0: Pantry expiry dates 

Each pantry item can now have an optional expiry date, set and cleared on the Pantry
page. The server part (11A-1) was deployed on 11-04-2026, the web app part (11A-2)
on 11-05-2026.

### Added

- **Migration `002_pantry_expiry.sql`:** a nullable `expires_on DATE` column on
  `pantry_items`. Existing rows have no date. It was applied on the 11-04-2026 deploy.
- **`PATCH /api/pantry/:ingredientId`** (Bearer), body `{ "expiresOn": "YYYY-MM-DD" }`
  to set the date or `{ "expiresOn": null }` to clear it.
  - `200` with the updated item: `{ "id": 1, "name": "egg", "expiresOn": "2026-11-10" }`
  - `404` if the ingredient isn't in the caller's pantry (another user's item is never changed)
  - `400` for an id that isn't a number, a date that isn't a real calendar date in
    `YYYY-MM-DD` form, a missing `expiresOn`, or any other key in the body
  - Past dates are allowed.
- **22 server tests** (135 → 157), including exact-date checks that fail if a date
  comes back as a timestamp or shifted by a day.
  - **Web app: an "Expiry dates" section** on the Pantry page, under "In your pantry".
  Each item shows "expires Nov 10, 2026" or "No date", with a date input, **Save**, and
  **Clear**. Save is enabled only for a real change; Enter in the date input saves.
- **`setPantryExpiry(token, ingredientId, expiresOn)`** in `api.js` (PATCH). Clearing
  sends `{ "expiresOn": null }`, never an empty body.
- **`formatExpiry`** (`dates.js`): formats a `YYYY-MM-DD` date in UTC so it shows the
  same day in every time zone.
- **34 web app tests** (204 → 238), including time-zone tests pinned to New York and a
  test that replays Chrome's digit-by-digit year changes.

### Changed

- `GET /api/pantry` items now include `expiresOn`: `"YYYY-MM-DD"` or `null`.
  `POST /api/pantry` still returns `{ id, name }`.

### Notes

- Dates are returned as text (`to_char`) because node-postgres would otherwise turn a
  `DATE` into a JavaScript `Date` at local midnight, which can serialize as the
  previous day.
- The production backup for this release was taken after the deploy rather than
  before (`neon-2026-11-04-after-002.dump`). The migration only adds an empty column,
  so no data was at risk.
- Saving a date waits for the server instead of updating at once. A failed save keeps
  the old date and shows the pantry's error alert. Saving a date doesn't refresh the
  recipe matches, because dates don't affect them.
- Dates are saved with an explicit button, not on every change: in Chrome, typing the
  year 2027 changes the input to 0002, 0020, 0202, then 2027, and each of those is a
  valid date the server would accept.

## 11-03-2026
### Verision 1.3.0: Database migrations

The schema is now built and changed through numbered migration files instead of a
single `schema.sql`. On 11-03-2026 the production database was backed up with `pg_dump` (the restore was checked locally) and the runner was run there once by hand: it
recorded `001` and changed nothing else.

### Added

- **Migration runner** (`server/src/db/migrator.js`): applies `.sql` files from
  `server/src/db/migrations/` in number order and records each one in a new
  `schema_migrations` table (version, name, sha256 checksum, time applied).
  - Already-applied files are skipped, so it is safe to repeat.
  - An applied file that was edited since stops the run with an error.
  - Each migration and its ledger row share one transaction, so a failed migration
    leaves nothing behind.
  - A Postgres advisory lock makes two runs at the same time take turns.
- **`001_baseline.sql`**: the previous `schema.sql`, unchanged. On a database that
  already has the tables it only records itself.
- **`npm run db:migrate`** (`server/src/db/migrate.js`) to run migrations by hand.
- **`.gitattributes`**: `.sql` files use LF line endings.

### Changed

- `npm run db:seed` runs the migrations first, then loads the seed data in its own
  transaction.
- The test helper `resetDatabase()` builds the schema through the migrations, so
  every test run, locally and in CI, exercises them.
- The API's Render build command is now `npm ci && npm run db:migrate`, so every
  deploy applies new migrations before the new version starts. A failed migration
  fails the build and the current version keeps serving.

### Removed

- `server/src/db/schema.sql`. Its contents live on as `001_baseline.sql`.

### Known limitations

- Migrations run in the build step because the free instance type has no
  pre-deploy command. Backups of the hosted database are manual (`pg_dump`).
- No down (undo) migrations: a mistake is fixed with a new migration.
- The runner itself has no automated tests. It was checked by hand on a sandbox
  database: empty database, repeat run, database built by the old seed, edited
  migration, broken migration, and two runs at once.

## 11-03-2026
### Version 1.2.0: Visual refresh
 
The web app has a new look: a warm "kitchen" theme with real light and dark modes,
a consistent layout, and clear hover, pressed, focus, and disabled states. The work
was done in eight small parts (V0 to V7), one pull request each. Screens, routes,
wording, behavior, data, and API calls are unchanged, and all 204 tests pass with
no test file edited.
 
### Added
 
- **Design tokens** on `:root` in `client/src/index.css`: colors, spacing, radius,
  shadow, font stack, type scale, and content width. Every color is written once with
  `light-dark()`, so a single rule serves both themes.
- **Two accent colors with a fixed meaning:** terracotta for actions (buttons, links,
  partial matches) and sage for "you have this" (ticked ingredients, chips, full
  matches, recipe marks).
- **Interaction states** for every control: hover, pressed, disabled, and a visible
  keyboard focus ring (`:focus-visible`).
- **Current-page highlight** in the header, using `NavLink` and its
  `aria-current="page"` attribute.
- **`index.html`:** a real `<title>`, a description, `color-scheme`, and
  `theme-color` for light and dark. The favicon `type` now matches the PNG file.
- No new dependencies, no new fonts, and no third-party requests.
### Behavior
 
- **Nothing works differently.** The same screens, text, and requests; only the look
  changed.
- **Dark mode now covers the whole page.** Before, `color-scheme` was set on `body`,
  so only form controls turned dark while the page stayed white.
- **Content is aligned with the header** in one centered column (40rem).
- **The header fits on phones:** items never break mid-word, the nav wraps under the
  brand, and a long email is shortened with "…".
- **Full and partial matches look different:** sage edge and bar for "You can make
  this now", terracotta for "You still need…".
- **Every error (`role="alert"`) uses one style:** a tinted box with a red edge.
  Loading and empty messages are muted.
- **Larger touch targets:** ingredient rows are 44px tall and fully clickable.
### Contrast (checked against WCAG AA)
 
| Pair | Light | Dark | Needed |
|---|---|---|---|
| Body text on page | 14.3 | 14.1 | 4.5 |
| Muted text on page | 5.9 | 7.2 | 4.5 |
| Links on page | 5.2 | 7.0 | 4.5 |
| Button text on terracotta | 5.6 | 7.0 | 4.5 |
| Sage text on cards | 6.0 | 8.1 | 4.5 |
| Error text in the error box | 6.3 | 6.0 | 4.5 |
| Input and button edges | 3.1 | 3.9 | 3.0 |
| Focus ring on page | 5.2 | 7.0 | 3.0 |
 
### Implementation notes
 
- **Class names only, never wording.** JSX changes are `className` values, `NavLink`
  in place of `Link` in the header nav, and one `<span>` around the recipe marks.
  The marks tests read `textContent`, which includes text inside the span, so they
  pass unchanged.
- **The `instructions` class name is kept** on purpose: `RecipePage.test.jsx` checks
  `.instructions b` and `.instructions img`, and a rename would make those checks
  pass without testing anything.
- **Selectors follow meaning already in the markup:** `button[type="submit"]` for
  primary buttons, `[aria-invalid="true"]` for field errors, `[role="alert"]` for
  error boxes, `label[for]` for field labels, and `label:has(input:checked)` for
  ticked rows.
- **Order matters on ties:** `.chips button` comes after the global `button` rules,
  so the chip × buttons keep their own look.
- **Progress bars** use `::-webkit-progress-*` and `::-moz-progress-bar` in separate
  rules, because one unknown pseudo-element would cancel a combined rule.
- **No motion was added,** so there is nothing for `prefers-reduced-motion` to turn
  off.
- Tests cannot see layout or color. Each part was checked by eye in light, dark, and
  at 360px, 768px, and wide screens, with before and after screenshots.
- To upgrade from 1.1.5: nothing to install. Pull and rebuild the web app.
### Example
 
```powershell
cd client
npm test
```
 
```
 Test Files  25 passed (25)
      Tests  204 passed (204)
```
 
### Files changed
 
- `client/src/index.css` (rewritten section by section)
- `client/index.html`
- `client/src/components/SiteHeader.jsx`, `RecipeResults.jsx`, `RequireAuth.jsx`
- `client/src/pages/HomePage.jsx`, `PantryPage.jsx`, `RecipePage.jsx`,
  `AccountPage.jsx`, `NotFoundPage.jsx`
- `client/.env.development` (local API address back to `http://localhost:3000`)
- `README.md`, `CHANGELOG.md`
### Known limitations
 
- No visual regression tests: a CSS change that breaks the look still passes CI.
- Uses `light-dark()` and `:has()`, which need a current browser (2024 or later).
  Older browsers get a plain but usable page.
- No automated accessibility audit; contrast was checked by hand for the pairs above.
- The favicon is still a 16px PNG; there is no larger icon for phone home screens.


## 11-02-2026
### Version 1.1.5: Tests for the remaining screens, hooks, and components

Every module in the web app now has automated tests except the two entry files
(`main.jsx` and `App.jsx`). The suite grew from 67 to 204 tests in 25 files. No
application code changed; the CI job from 1.1.0 runs the new tests with no
configuration change.

### Added

- **137 new client tests in 16 files**, in three groups:
  - **Small modules and components (39):**
    - `auth/formErrors.test.js` (4), `auth/tokenStorage.test.js` (5)
    - `components/FormField.test.jsx` (4), `components/MaxMissingSelect.test.jsx` (3)
    - `components/SelectedIngredients.test.jsx` (6), `components/IngredientPicker.test.jsx` (9)
    - `components/RecipeResults.test.jsx` (8)
  - **Pages (45):**
    - `pages/HomePage.test.jsx` (18): the page with a hand-built `search` object, and the page with the real search hook.
    - `pages/PantryPage.test.jsx` (16)
    - `pages/RegisterPage.test.jsx` (11)
  - **Hooks (53):**
    - `hooks/useIngredients.test.js` (6), `hooks/useRecipeMatches.test.js` (8)
    - `hooks/useMyMatches.test.js` (11), `hooks/useSearchState.test.js` (9)
    - `hooks/usePantryNames.test.js` (8), `hooks/useRecipe.test.js` (11)
- No new dependencies and no configuration changes.

### Behavior

- **Nothing the user sees has changed.** This version only adds tests.
- **Still no network:** `api.js` is replaced in the page and hook tests, `useAuth` in
  the form and header tests, and `Storage` methods are spied on in the token tests.
- **Every area of the web app is covered.** The exceptions are `main.jsx` and
  `App.jsx`, which only start the app and wire the routes.
- **CI runs all 204 tests** in the existing `Test` step. A failing test still stops
  the build and the deploy.

### Validation (what the new tests pin down)

| Input | Rule |
|---|---|
| Several server messages for one field | Only the first is shown beside the field |
| Server error with no field details | Shown once as a general alert |
| Storage that is blocked or full | Token reads return `null`; writes and clears never throw |
| Ingredient search text | Matches ignoring case and surrounding spaces; no match shows a message and no list |
| 50 ingredients selected | New picks are disabled; selected ones can still be unticked |
| "None" in the missing-ingredients menu | Reported as the string `"0"`; "Any number" is reported as `""` |
| No ingredient selected, or a search running | "Find recipes" is disabled |
| Empty registration form | Still submitted; the server is the only validator |
| Switching between register and login | The page to return to is kept |
| A new search while one is running | The old request is aborted and its result ignored |
| A pantry change confirmed by the server | The recipe matches refresh |
| A pantry change that fails and rolls back | The recipe matches do not refresh |
| Match refresh in progress | The old recipes stay visible, with no loading flash; a failed refresh keeps them next to the error |
| Pantry names for the recipe marks | Never shown to a different token; `null` after logout |
| Chips for selected ingredients | Always in catalog order, whatever order they were picked or saved |
| Recipe results | Shown in the order the server sent them |
| Cancelled request (`AbortError`) | Ignored: no error and no state change |

### Implementation notes

- **Two layers for pages that take a prop.** `HomePage` is tested with a hand-built
  `search` object (fast; can create states that are hard to click into) and again
  inside a small harness that runs the real `useSearchState` (proves the wiring).
  Each layer catches bugs the other cannot.
- **A refresh is observable as a call.** The pantry tests prove that matches refresh
  after a change by counting calls to `getMyMatches`, since the refresh has no other
  visible effect.
- **Hooks are tested with `renderHook`,** reading `result.current` after each
  `act`. Re-rendering with new inputs (`rerender`) tests dependency arrays, such as
  the pantry `version` that triggers a match refresh.
- **Every test file resets mocks** with `vi.resetAllMocks()` in `beforeEach`, and the
  token tests restore their spies after each test.
- **The tests were checked by breaking the code.** Each rule above was verified by
  changing the real source (removing a guard, a dependency, or a cleanup) and
  confirming that exactly the expected test failed.
- jsdom does not navigate, so a missing `event.preventDefault()` on a form submit
  cannot be caught by these tests; only a real browser would show it.
- To upgrade from 1.1.0: run `npm test` in `client/`; nothing needs installing.

### Example

```powershell
cd client
npm test
```

```
 Test Files  25 passed (25)
      Tests  204 passed (204)
```

### Files changed

- `client/src/auth/`: `formErrors.test.js`, `tokenStorage.test.js` (new)
- `client/src/components/`: `FormField.test.jsx`, `MaxMissingSelect.test.jsx`,
  `SelectedIngredients.test.jsx`, `IngredientPicker.test.jsx`,
  `RecipeResults.test.jsx` (new)
- `client/src/pages/`: `HomePage.test.jsx`, `PantryPage.test.jsx`,
  `RegisterPage.test.jsx` (new)
- `client/src/hooks/`: `useIngredients.test.js`, `useRecipeMatches.test.js`,
  `useMyMatches.test.js`, `useSearchState.test.js`, `usePantryNames.test.js`,
  `useRecipe.test.js` (new)
- `README.md`, `CHANGELOG.md`

### Known limitations

- No test renders the whole `App`, so the route table (which paths are protected,
  and the not-found fallback) is checked only through its pieces.
- No end-to-end tests: nothing runs the real client against the real API, so a
  mismatch between the two halves is caught only if both sides' tests pin the same
  field names.
- No coverage report for the web app, and no real-browser tests (layout, form
  navigation, focus).
- Accessibility is covered only through the role and label queries the tests use,
  not by an audit.

## 11-01-2026
### Version 1.1.0: Frontend tests

The web app now has an automated test suite (67 tests) built on Vitest, jsdom, and
React Testing Library, and the CI pipeline runs it on every push and pull request,
between lint and build. A failing client test now stops the build and, through the
deploy gate, stops a deployment. No application behavior changed.

### Added

- **Client test tooling:** Vitest (runner), jsdom (a fake browser), React Testing
  Library, `user-event`, and `jest-dom` (readable assertions).
- **Configuration:** the `test` section in `client/vite.config.js` (jsdom
  environment, a setup file, and a fixed `VITE_API_URL` of `http://api.test`), and
  `client/src/test/setup.js` (registers the assertions and cleans up after each test).
- **Scripts:** `npm test` (run once, for CI) and `npm run test:watch` (re-run on save).
- **67 client tests in 9 files:**
  - `api.test.js` (18): request building, the `204` case, `ApiError`, network
    failures, abort handling, the unauthorized handler, query strings.
  - `auth/AuthProvider.test.jsx` (11): startup, the `checking` state, login,
    register, logout, the unauthorized handler, `useAuth` outside the provider.
  - `components/RequireAuth.test.jsx` (3): the three session states.
  - `pages/LoginPage.test.jsx` (6): return to the original page, per-field errors,
    the submitting state.
  - `hooks/usePantry.test.js` (12): loading, retry, optimistic updates, rollback,
    the `404` rules, requests in flight.
  - `pages/RecipePage.test.jsx` (10): loading, display, marks, errors, retry.
  - `pages/AccountPage.test.jsx` (2), `components/SiteHeader.test.jsx` (4),
    `pages/NotFoundPage.test.jsx` (1).
- **CI:** a `Test` step in the client job, after `Lint` and before `Build`.
- Dev dependencies: `vitest`, `jsdom`, `@testing-library/react`,
  `@testing-library/user-event`, `@testing-library/jest-dom`.

### Behavior

- **Tests never touch the network or a real server.** `fetch` is replaced in the
  `api.js` tests, `api.js` is replaced in the provider, hook, and page tests, and the
  API address in tests is a fake host that does not exist.
- **Every test starts from an empty page.** Rendered components are removed after
  each test, and mocks and stored tokens are reset between tests.
- **The client CI job runs in this order:** install, lint, test, build. A failing
  test fails the job, the build is skipped, and Render does not deploy that commit.
- No application code changed in this phase.

### Validation (what the client tests pin down)

| Input | Rule |
|---|---|
| `401` on a request that carried a token | Runs the unauthorized handler once |
| `401` on a request with no token (failed login) | Does not run the handler |
| `204` response | Returns `null` without reading a body |
| Network failure | `ApiError` with no `status`; an abort is rethrown unchanged |
| `maxMissing` of `"0"` | Sent to the API (zero is a real choice) |
| Pantry removal answered with `404` | Counts as success (already gone) |
| Pantry add answered with `404` | Rolled back with an error |
| Recipe `404` or `400` | "We couldn't find that recipe", no retry button |
| Recipe `5xx` or network error | Error message with a working retry button |
| Failed pantry lookup on the recipe page | Silently falls back to the typed selection |
| Recipe instructions containing HTML | Shown as text, never as markup |
| Stored token whose check fails by network | Token kept; only a `401` clears it |

### Implementation notes

- **Mock the layer directly below the unit.** `api.js` tests replace `fetch`;
  provider, hook, and page tests replace `api.js`; route-guard and form tests
  replace `useAuth`. Each test ignores everything beneath the layer it replaces.
- **Test what the user sees.** Elements are found by role, label, and visible text,
  never by CSS class, so a test fails when behavior or accessibility breaks and not
  when markup is restyled.
- **Deferred promises** freeze a request in flight so the optimistic state can be
  inspected, then release it inside `act` so React finishes updating before the
  assertion.
- **Dates are computed, not hardcoded.** The account page test builds its expected
  text with `toLocaleDateString()`, since the output depends on the machine's locale
  and timezone.
- **The client and server tests agree through a contract, not through a shared
  file.** The server tests pin which fields the API sends (`prepMinutes`,
  `createdAt`); the client tests pin how those fields are read. Neither side can
  detect a mismatch alone, which is how the `prepMinutes` bug in 1.0.1 got through.
- Vite's `defineConfig` is imported from `vitest/config` so the `test` section is
  understood; the dev server settings are unchanged.
- To upgrade from 1.0.1: run `npm install` in `client/`, then `npm test`. In GitHub,
  require the **Server tests** and **Client lint and build** checks before merging
  into `main`.

### Example

```powershell
cd client
npm test
```

```
 Test Files  9 passed (9)
      Tests  67 passed (67)
```

### Files changed

- `client/vite.config.js`: `test` section, `defineConfig` from `vitest/config`
- `client/package.json`, `client/package-lock.json`: test scripts and dev dependencies
- `client/src/test/setup.js`: new
- `client/src/` (new test files): `api.test.js`, `auth/AuthProvider.test.jsx`,
  `components/RequireAuth.test.jsx`, `components/SiteHeader.test.jsx`,
  `hooks/usePantry.test.js`, `pages/AccountPage.test.jsx`,
  `pages/LoginPage.test.jsx`, `pages/NotFoundPage.test.jsx`,
  `pages/RecipePage.test.jsx`
- `.github/workflows/ci.yml`: `Test` step in the client job
- `README.md`, `CHANGELOG.md`

### Known limitations

- Not every screen is tested yet: `HomePage`, `PantryPage`, `RegisterPage`, the
  picker, results, and form components, and the `useIngredients`, `useRecipeMatches`,
  `useMyMatches`, and `useSearchState` hooks have no tests of their own.
- No end-to-end tests: nothing runs the real client against the real API, so a
  mismatch between the two halves is caught only if both sides' tests pin the same
  field names.
- No client coverage report and no browser-level tests (real browser, real layout).
- No accessibility audit beyond the role and label queries the tests use.
### Version 1.0.1: Fixes found while verifying the deployment

Checking the first deployment turned up bugs that the 133 server tests could not
see, because they were mismatches between the API and the web app or mistakes in
configuration files. Each fix has a regression test where one is possible.

### Added

- **Server tests:** the recipe detail response returns the prep time under
  `prepMinutes`, and `GET /api/auth/me` returns a real `createdAt` date. The server
  suite is now 135 tests.

### Behavior

- **Account page:** "Member since" shows the real date (it showed "Invalid Date").
- **Recipe detail page:** the prep time is shown (it was never displayed).
- **Login failure message** now reads "Invalid email or password" (it had a typo).
- **Client API address:** `client/.env.development` points to the local API.
- **Deployment gate:** `autoDeployTrigger: checksPass` now sits on each service in
  `render.yaml`, where Render reads it.

### Validation

No input rules changed.

### Implementation notes

- `toUser` read `row.createdAt`, but `pg` returns `created_at`; the service layer is
  where database names become API names, so the mapper was corrected there.
- `getRecipeById` returned `prepminutes`, while the list endpoint and the client use
  `prepMinutes`.
- `render.yaml` had service blocks nested inside `envVars`, so the deploy gate was
  not applied as intended. No test could catch this, since tests never read it.
- The 1.0.0 entry and the README said the client lint tool was ESLint; it is oxlint.
- A leftover startup `console.log` was removed from `src/db/pool.js`.

### Example

```powershell
curl.exe -i https://pantry-api-ag.onrender.com/api/recipes/2
```

The response body now contains `"prepMinutes": 10`.

### Files changed

- `server/src/services/authService.js`, `server/src/services/recipeService.js`
- `server/src/controllers/authController.js`, `server/src/db/pool.js`
- `server/tests/catalog.test.js`, `server/tests/auth.test.js`
- `client/.env.development`, `render.yaml`
- `README.md`, `CHANGELOG.md`

### Known limitations

- Mismatches between the API's response fields and the fields the web app reads are
  caught only if both sides have tests that pin the same names.
- Nothing validates `render.yaml` automatically, so a malformed deployment file shows
  up only when Render reads it.

## 10-27-2026
### Version 1.0.0

The app can now run in production: the server reads its settings from the
environment and refuses unsafe production configurations, a Render blueprint
describes the API and the web app, every push is checked by an automated pipeline,
deployments wait for that pipeline to pass, and the server writes structured logs
with request ids. No endpoint changed its behavior.

### Added

- **Health endpoints**, both exempt from rate limiting and authentication:
  - `GET /api/health/live`: liveness. Returns `200` `{ "status": "ok" }` whenever
    the process is running, without touching the database.
  - `GET /api/health`: readiness. Returns `200`
    `{ "status": "ok", "database": "up" }`, or `503`
    `{ "status": "degraded", "database": "down" }` when the database does not answer
    within 2 seconds.
- **Production configuration:** `PORT` (default 3000), `NODE_ENV`, and `LOG_LEVEL`
  environment variables, with startup checks that refuse unsafe production settings.
- **Graceful shutdown:** on `SIGTERM` or `SIGINT` the server stops accepting
  requests, lets in-flight requests finish, closes the database pool, and exits.
  Unhandled errors are logged as `fatal` before the process exits.
- **Structured logging** (via `pino` and `pino-http`): one JSON line per request
  with a request id, method, path, status, and timing.
- **Request ids:** every response carries an `X-Request-Id` header, which browsers
  can read on cross-origin requests.
- **Deployment configuration:** `render.yaml`, a blueprint for a Render web service
  (the API) and a Render static site (the React app), with a single-page-app
  rewrite rule.
- **CI pipeline** (`.github/workflows/ci.yml`, GitHub Actions):
  - *Server tests*: starts PostgreSQL 16 and runs the full suite.
  - *Client lint and build*: runs ESLint and a production build.
- **Dependabot** (`.github/dependabot.yml`): weekly update pull requests for the
  server's packages, the client's packages, and the GitHub Actions versions.
- **Tests:** 22 new tests (health, configuration checks, observability), and the
  error-handler tests were rewritten for the new logger; the server suite is now
  133 tests.
- `engines` field in `server/package.json` (`node >= 20.10`).
- Dependencies: `pino`, `pino-http`; dev dependency `pino-pretty`.

### Behavior

- **Startup checks in production** (`NODE_ENV=production`): the server refuses to
  start unless `CORS_ORIGINS` is set explicitly, every origin uses `https://`, and
  `BCRYPT_ROUNDS` is at least 10. Outside production, nothing changes.
- **Deployments are gated:** Render deploys a commit only after its GitHub checks
  pass, and does not deploy when a check fails or when no checks are detected.
- **Log levels follow the status code:** `info` for 2xx and 3xx, `warn` for 4xx,
  `error` for 5xx and crashes. The liveness check is not logged.
- **Client errors are not logged as errors:** only 5xx responses log the full error
  and stack trace. The response to the client is unchanged (a vague message for
  5xx, the error's own message for 4xx).
- **Log lines never contain secrets:** no request or response bodies, headers,
  cookies, tokens, passwords, or query strings. Authenticated requests log the
  numeric `userId`, never an email.
- **Request ids:** a caller-supplied `X-Request-Id` is reused only if it is 8 to 64
  letters, digits, or dashes; otherwise a new UUID is generated.
- **Cold starts on the free hosting plans:** the API sleeps after a period without
  traffic and takes about a minute to wake, and the database wakes in a few
  seconds. The in-memory rate-limit counters reset when the API restarts.

### Validation (returns an error at startup unless noted)

| Input | Rule |
|---|---|
| `PORT` | Integer from 1 to 65535 (default 3000) |
| `NODE_ENV=production` with no `CORS_ORIGINS` | Refused |
| `NODE_ENV=production` with a non-`https://` origin | Refused |
| `NODE_ENV=production` with `BCRYPT_ROUNDS` below 10 | Refused |
| `LOG_LEVEL` | One of `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` (default `debug`, or `info` in production) |
| `TRUST_PROXY` | Integer from 0 to 5; set it to the number of proxies in front of the app |
| `X-Request-Id` request header (per request) | 8 to 64 letters, digits, or dashes; anything else is replaced |

### Implementation notes

- **Two kinds of configuration.** The server reads its settings when it starts, so
  a restart applies a change. The React app's `VITE_API_URL` is embedded in the
  bundle at build time, so changing it requires a rebuild. This is why the first
  deployment has two passes: the API's address is not known until the API exists.
- **Two health checks, on purpose.** The platform's health check points at the
  shallow `/api/health/live`, so a database hiccup cannot fail a deploy or cause a
  restart that wouldn't fix it. The deeper `/api/health` is for monitoring. An
  uptime monitor should ping the liveness path frequently: pinging the deep one
  keeps the database awake and uses its free compute hours.
- **TLS ends at the platform.** The app speaks plain HTTP behind the platform's
  proxy, so `TRUST_PROXY` must match the number of proxies for rate limiting to see
  real client addresses. If it is too low, all users share one rate-limit bucket;
  too high, clients could forge their address. Verify it once after deploying by
  logging `req.ip` and comparing it with your own public address.
- **Hosted database over TLS.** The connection string from the database provider
  includes `sslmode=require`, and the driver verifies the certificate. Use the
  provider's direct (not pooled) connection string, since the server keeps its own
  pool.
- **Seeding production** is done from a developer machine by setting
  `DATABASE_URL` for one command; it loads only the recipe catalog. The test
  helpers refuse to run against any database whose name does not end in `_test`, so
  a mistaken connection string cannot be used to wipe production.
- **CI starts from nothing.** The workflow installs from the lockfiles (`npm ci`),
  starts a fresh database, and writes its own `.env.test` containing throwaway
  values, so no real secret enters CI. Linux filenames are case-sensitive, so a
  casing mistake in an import that works on Windows fails in CI. The workflow runs
  with read-only repository permissions, and a newer push cancels an older run of
  the same branch.
- **Testing failure modes.** The database outage tests replace `pool.query` with a
  function that throws, which proves that a database failure on a normal route
  becomes a controlled `500`, and that `/api/health` reports `503` without any
  error text. The configuration checks are tested by importing `config.js` in a
  fresh process with a controlled environment, since it reads settings when first
  imported.
- **Logging by allow-list.** The request and response serializers name exactly
  what is logged. A test sends a password, a bearer token, a cookie, and a query
  string secret, and asserts that none appear in the output.
- `src/db/pool.js` still reports idle-connection errors with `console.error`, so
  the seed script does not need server settings.
- To upgrade from 0.7.0: run `npm install` in `server/`; add `LOG_LEVEL=silent` to
  `server/.env.test`; push the repository to GitHub; follow the deployment
  section of the README.

### Example

Health checks against a running server:

```powershell
curl.exe -i http://localhost:3000/api/health/live
curl.exe -i http://localhost:3000/api/health
```

```json
{ "status": "ok" }
{ "status": "ok", "database": "up" }
```

One request's log line (raw JSON, as produced in production):

```json
{"level":30,"time":"2026-10-27T14:03:11.402Z","service":"pantry-api","req":{"id":"6f1c2c1e-8a3e-4c1a-9d3e-2b7a1f0c5e11","method":"GET","path":"/api/ingredients"},"res":{"statusCode":200},"responseTime":12,"msg":"request completed"}
```

The same `id` is returned to the caller in the `X-Request-Id` response header, so a
reported problem can be found in the logs by its id.

### Files changed

- `server/src/config.js`: `PORT`, `NODE_ENV`, `LOG_LEVEL`, and the production checks
- `server/src/server.js`: configurable port, graceful shutdown, fatal-error logging
- `server/src/app.js`: request logger first, the health routes before the limiter,
  `X-Request-Id` exposed to browsers
- `server/src/logger.js`, `server/src/middleware/requestLogger.js`: new
- `server/src/middleware/errorHandler.js`: logs 5xx errors through the request logger
- `server/src/services/healthService.js`, `controllers/healthController.js`,
  `routes/health.js`: new
- `server/tests/`: `health.test.js`, `config.test.js`, `observability.test.js` added;
  `errorHandler.test.js` rewritten
- `render.yaml`: deployment blueprint
- `.github/workflows/ci.yml`, `.github/dependabot.yml`: CI and dependency updates
- `server/.gitignore`, `server/.env.test`, `server/package.json`: small updates
- `README.md`, `CHANGELOG.md`

### Known limitations

- On the free hosting plans, the API and the database both sleep when idle, so the
  first request after a quiet period is slow. An uptime monitor pinging the liveness
  path keeps the API awake but uses its free hours.
- There is no error-tracking service, metrics, or dashboards: monitoring is an
  uptime ping with email alerts, plus searchable logs on the hosting platform.
- There is no staging environment: a commit that passes CI deploys to production.
- There is no migration tool. `schema.sql` creates missing tables safely but cannot
  alter existing ones, so a column change needs manual SQL.
- No backup or restore procedure is documented for the hosted database.
- No automated tests for the web app (planned: Vitest and React Testing Library).
- Rate-limit counters live in memory (reset on restart, not shared across
  instances), and limits are per IP address.
- The browser token is kept in `localStorage`, which any script on the page can
  read; there is no refresh token or server-side revocation.
- The site runs on the hosting platform's domain; there is no custom domain.

## 10-26-2026
### Version 0.7.0

The app now has a browser client: a React app (built with Vite) in `client/` where
visitors pick ingredients and see ranked recipes, open recipe details, register and
log in, and keep a saved pantry that drives live recipe matches. The API is
unchanged.

### Added

- **`client/`:** a React 19 + Vite app (JavaScript) that talks to the existing API.
- **Screens** (React Router):
  - `/`: ingredient picker with search, selection chips, a "how many missing
    ingredients are OK" filter, and ranked results.
  - `/recipes/:id`: recipe detail with ingredients and instructions.
  - `/login`, `/register`: forms that show the server's validation messages beside
    each field.
  - `/pantry` (login required): the saved pantry, with recipes ranked against it.
  - `/account` (login required): email and join date.
  - Any other address shows a "Page not found" page.
- **Result cards** show the match as "n of m ingredients" with a progress bar and
  either "You can make this now" or "You still need: ...".
- **Recipe detail marks** each ingredient "you have this" or "you need this", using
  the saved pantry when logged in and the ticked selection otherwise.
- **Session handling:** register, login, logout, and session restore on reload.
- **API client** (`client/src/api.js`): one `request` function that adds the token,
  turns failures into an `ApiError` (carrying `status` and the server's `details`),
  and tells the app when a token is rejected.
- **Hooks:** `useIngredients`, `useRecipeMatches`, `useSearchState`, `useRecipe`,
  `usePantry`, `useMyMatches`, `usePantryNames`, `useAuth`.
- **Shared components:** `IngredientPicker`, `SelectedIngredients`,
  `MaxMissingSelect`, `RecipeResults`, `FormField`, `RequireAuth`, `SiteHeader`.
- `client/.env.development` with `VITE_API_URL` (the API's address).
- Client scripts: `dev`, `build`, `preview`, `lint`.
- Dependencies: `react`, `react-dom`, `react-router`, `vite` (plus ESLint tooling).

### Behavior

- Every screen that loads data handles four states: loading, error (with a retry
  button), empty, and success.
- **Session states:** `checking` (a stored token is being verified), `authenticated`,
  and `anonymous`. Nothing is drawn as logged out while a stored token is being
  checked.
- **A `401` on any request that carried a token ends the session.** The stored token
  is cleared, protected screens redirect to `/login`, and after logging in the user
  returns to the page they were on. A failed login (which carries no token) does not
  trigger this.
- A failed session check caused by a network error does **not** delete the stored
  token; only a `401` does.
- **Saved pantry updates are optimistic.** The checkbox and chip change immediately,
  and the change is undone with an error message if the request fails. A `404` when
  removing an ingredient counts as success (it is already gone). An ingredient with a
  request in flight is disabled, so there is at most one request per ingredient.
- **Pantry matches refresh automatically** when the pantry or the "missing
  ingredients" choice changes. A newer request aborts an older one, so a slow old
  response cannot overwrite a newer one.
- The home-page selection is kept in memory: it survives moving between screens but
  not a page reload.
- An unknown or malformed recipe id shows "We couldn't find that recipe."
- Recipe instructions are rendered as text, never as HTML.
- No user-specific data survives logout: the pantry lives inside the protected page,
  and the recipe page's pantry lookup is tied to the token it was loaded with.

### Validation (client side; the server remains the authority)

| Input | Rule |
|---|---|
| Ingredient selection | At most 50 (mirrors the API); "Find recipes" is disabled with nothing selected or while a search runs |
| Forms | Browser validation is turned off (`noValidate`); every message comes from the server's `details` |
| Route parameters | Encoded with `encodeURIComponent` before being placed in an API URL |
| Pantry ids | Sent as JSON numbers, as the API requires |
| Search box | Trimmed and case-insensitive |

### Implementation notes

- The client calls the API **cross-origin** (`VITE_API_URL`), so it uses the CORS
  allowlist from 0.6.0. The default allowed origin is `http://localhost:5173`; Vite is
  pinned to that port with `strictPort`, so a busy port fails loudly instead of
  producing confusing CORS errors.
- `VITE_` variables are embedded in the browser bundle and are public. They must
  never hold secrets.
- **Where state lives:** the search state is created in `App`, which stays mounted
  across routes, so it survives navigation. Per-user pantry state is created inside
  the protected page and is discarded on logout.
- The session is shared through React Context, split across three files (context,
  provider, hook).
- **Token storage trade-off:** the token is kept in `localStorage` (key
  `pantry.token`) and sent as `Authorization: Bearer`. That survives reloads but is
  readable by any script running on the page. Mitigations: React escapes all text,
  tokens expire after one hour, and no third-party scripts are loaded. The stronger
  option is an HttpOnly cookie with refresh tokens, which needs server changes.
- Effects clean up with `AbortController`. In development, React StrictMode mounts
  each component twice, which shows up as one canceled request in the Network tab.
- Client-side routing means a hosting platform must serve `index.html` for any
  path. The Vite dev server does this already; production hosting needs a rewrite
  rule (Phase 8).
- To run it: start the API (`server/`, `npm run dev`), then in `client/` run
  `npm install` and `npm run dev`, and open `http://localhost:5173`.
- To upgrade from 0.6.0: no server changes. Create the client; make sure
  `CORS_ORIGINS` includes the client's origin (the default already does).

### Example

```powershell
# Terminal 1: the API
cd server
npm run dev

# Terminal 2: the web app
cd client
npm install
npm run dev
```

Then open `http://localhost:5173`, register, tick a few ingredients on **My pantry**,
and the ranked recipes update on their own.

### Files changed

- `client/` (new): `src/api.js`, `src/main.jsx`, `src/App.jsx`, `src/index.css`,
  `src/auth/`, `src/components/`, `src/hooks/`, `src/pages/`, `vite.config.js`,
  `.env.development`
- `README.md`, `CHANGELOG.md`: updated for the frontend
- Server: no code changes

### Known limitations

- No automated frontend tests yet (planned: Vitest and React Testing Library).
- The selection on the home page is lost on reload, because it is held in memory
  rather than in the URL.
- The token in `localStorage` can be read by any script on the page. Logging out
  clears it from the browser but does not revoke it on the server, and there is no
  refresh token, so an expired token means logging in again.
- The pantry API has no bulk operation, so each tick is one request, and there is no
  "clear pantry" button.
- Scroll position is not restored when returning to the results list.
- Only basic accessibility is covered (labels, roles, keyboard-operable controls);
  there has been no full audit.
- No production build or hosting configuration yet (planned: Phase 8).

## 10-24-2026
### Version 0.6.0: Testing and hardening

The API now has an automated test suite (111 tests) that runs against a separate
test database, and it is hardened against common abuse: security headers, a CORS
allowlist, a request size limit, rate limiting, and schema-based input validation
with one consistent error format. No existing endpoint changed its behavior.

### Added

- **Automated tests:** `npm test` runs 111 tests with Node's built-in test runner
  and `supertest`, against a separate `pantry_test` database.
  - `catalog` (6), `auth` (24), `matching` (20), `pantry` (32), `errorHandler`
    (4), `security` (7), `rate limiting` (8), `validation` (10).
- **`npm run test:coverage`:** the same suite with a coverage report.
- **Security headers** on every response (via `helmet`); `X-Powered-By` is removed.
- **CORS allowlist:** only origins listed in `CORS_ORIGINS` may read responses from
  a browser.
- **Request size limit:** JSON bodies over 10 KB are rejected with `413`.
- **Rate limiting** (via `express-rate-limit`):
  - General: 300 requests per 15 minutes per IP, on every `/api` route.
  - `POST /api/auth/login`: 10 failed attempts per 15 minutes per IP.
  - `POST /api/auth/register`: 20 requests per hour per IP.
- **Schema validation** (via `zod`): `validate` middleware and
  `validation/schemas.js`; cleaned input is available to controllers as `req.valid`.
- `src/server.js`: the process entry point. `src/app.js` now only builds and
  exports the app.
- Optional environment variables: `CORS_ORIGINS`, `TRUST_PROXY`,
  `RATE_LIMIT_GENERAL_MAX`, `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_REGISTER_MAX`,
  `BCRYPT_ROUNDS`.
- Scripts: `test`, `test:coverage`. `dev` and `start` now run `src/server.js`.
- Dependencies: `helmet`, `cors`, `express-rate-limit`, `zod`; dev dependency
  `supertest`.
- Postman collection and `Local` environment in `postman/` for manual exploration.

### Behavior

- **Rate-limited requests** return `429` with `{ "error": "..." }`, a `Retry-After`
  header (seconds), and standard `RateLimit` / `RateLimit-Policy` headers on every
  `/api` response, so clients can see their remaining budget.
- **The login limit counts only failed attempts.** Once a client has used its
  budget, further login attempts return `429` until the window ends, even with the
  correct password.
- **Validation errors** return `400` with
  `{ "error": "<first message>", "details": [{ "field": "...", "message": "..." }] }`.
  Every problem is reported at once. The `error` string is unchanged from earlier
  versions, so existing clients keep working.
- **CORS:** a listed origin receives `Access-Control-Allow-Origin` for that origin.
  An unlisted origin receives no permission header, but the request is still served
  (browsers, not the server, refuse to hand the response to the page). Preflight
  `OPTIONS` requests are answered with `204` before authentication, so they work
  without a token.
- Authentication is checked before validation on protected routes: a request with
  no token and a bad body gets `401`, not `400`.
- A request body over 10 KB returns `413`.
- All existing endpoints keep their previous statuses and messages, verified by the
  test suite.

### Validation (returns `400` unless noted)

| Input | Rule |
|---|---|
| Path ids (`/api/recipes/:id`, `/api/pantry/:ingredientId`) | Digits only; a value above 2147483647 is well-formed but cannot exist, so it returns `404` |
| `ingredients` (`/api/recipes/match`) | Required, comma-separated positive integers, duplicates ignored, at most 50 unique ids, each at most 2147483647 |
| `maxMissing` (both match endpoints) | Optional; digits only, at most 2147483647 |
| Register `email` | Trimmed and lowercased; valid format; at most 254 characters |
| Register `password` | At least 8 characters and at most 72 **bytes** |
| Login `email` / `password` | Both strings; the email is trimmed and lowercased (no format check) |
| `POST /api/pantry` `ingredientId` | A JSON integer from 1 to 2147483647 (strings and decimals rejected) |
| Any JSON body over 10 KB | `413` |
| Unlisted `Origin` | Request served, no CORS permission header |

### Implementation notes

- **App and server are separate.** `app.js` exports the Express app without
  listening, so tests can drive it in-process; `server.js` starts it.
- **Tests are isolated and guarded.** `.env.test` is loaded with `--env-file`;
  `dotenv` never overrides variables that already exist, so tests use
  `pantry_test`. The test helpers throw unless the database name ends in `_test`,
  before any query runs. Each file resets the schema, truncates all tables with
  `RESTART IDENTITY`, and inserts a small fixture set independent of the seed data.
  Test files run one at a time (`--test-concurrency=1`) because they share one
  database. Tests use `BCRYPT_ROUNDS=4`; the default stays 12.
- **Middleware order matters:**
  `helmet → cors → general limiter → JSON parser → routers → notFound → errorHandler`.
  `cors` runs before the routes so preflights never reach authentication, and the
  limiter runs after `cors` so a `429` still carries CORS headers.
- **Limiters are built by a `createLimiter` factory.** Behavior tests use tiny
  limits on an isolated app; wiring tests on the real app check which limiter
  applies to each route through the `RateLimit-Policy` header.
- **Validation is separated from existence checks.** Schemas decide whether input
  is well-formed (`400`). Questions that need the database stay in the controllers
  and services (unknown ingredient, duplicate email, a missing recipe), and the
  database constraints remain the last line of defense. The tests confirmed this:
  removing the email lowercasing in the schema made the `CHECK (email = lower(email))`
  constraint reject the insert.
- Parsed input is placed on `req.valid`, not written back to `req.body` or
  `req.query` (read-only in Express 5).
- `trust proxy` is set only when `TRUST_PROXY` is above 0, and only to a number of
  hops, never `true`, which would let clients forge their address.
- A unit test found that `errorHandler` checked a misspelled property
  (`res.headerSent`), so responses that had already started were not handed back to
  Express. It now checks `res.headersSent`.
- `utils/parseMaxMissing.js` was removed; the shared `maxMissing` schema replaces it.
- To upgrade from 0.5.0: run `npm install`; create the test database
  (`CREATE DATABASE pantry_test;`) and a `server/.env.test`; start the server with
  `npm run dev` (it now runs `src/server.js`); optionally set the new variables.

### Example

A request that fails validation reports every problem:

```powershell
curl.exe -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{}"
```

```json
{
  "error": "email is required",
  "details": [
    { "field": "email", "message": "email is required" },
    { "field": "password", "message": "password is required" }
  ]
}
```

Running the suite:

```powershell
npm test
```

```
ℹ tests 111
ℹ pass 111
ℹ fail 0
```

### Files changed

- `src/app.js`: builds and exports the app; adds `helmet`, `cors`, the general
  limiter, and the body size limit
- `src/server.js`: new entry point
- `src/config.js`: validated settings for CORS origins, rate limits, trust proxy,
  and bcrypt cost
- `src/middleware/validate.js`, `rateLimiters.js`: new
- `src/validation/schemas.js`: new
- `src/middleware/errorHandler.js`: fixed the `headersSent` check
- `src/routes/auth.js`, `recipes.js`, `pantry.js`: attach limiters and schemas
- `src/controllers/authController.js`, `recipeController.js`,
  `pantryController.js`: input checks removed (now in schemas)
- `src/services/authService.js`: bcrypt cost comes from configuration
- `src/utils/parseMaxMissing.js`: removed
- `tests/`: `helpers.js` plus eight test files
- `.env.test`, `.gitignore`, `package.json`: test configuration and scripts

### Known limitations

- No HTTPS enforcement yet (production deployment phase); the `Strict-Transport-Security`
  header only takes effect once the API is served over HTTPS.
- Rate-limit counters live in server memory: they reset on restart and are not
  shared between multiple server instances. Limits are per IP address, so users
  sharing an address share a budget, and there is no per-account lockout.
- Tokens cannot be revoked before they expire, and there is no refresh token or
  logout flow (planned: Phase 7c).
- No password reset, email verification, or account deletion.
- The tests do not cover a real database outage (only the error handler is tested
  directly) or server startup checks, and there is no CI pipeline yet (planned:
  Phase 8).
- The pantry stores only presence (no quantities or expiry dates), and there is no
  frontend yet.

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