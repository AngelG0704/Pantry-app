# Changelog

All notable changes to this project will be further documented in this file, see README.md
for a more broad information about this project.

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