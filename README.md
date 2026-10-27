# Pantry App

![CI](https://github.com/AngelG0704/pantry-app/actions/workflows/ci.yml/badge.svg)

Tell the app what's in your kitchen, and it tells you what you can cook, ranked by
how many ingredients you already have and listing exactly what's missing.

**Live site:** https://pantry-client-ag.onrender.com

**Status:** the full stack app (API, database, accounts, saved pantry, recipe
matching, and a React web app) is complete, tested, hardened, and deployable
through **v0.8.0**, with automated CI/CD and structured logging. See the
[Roadmap](#roadmap).

Version history lives in [CHANGELOG.md](CHANGELOG.md).

---

## Features

- **Browse** ingredients and recipes, with each recipe's ingredient list
- **Match** recipes against a set of ingredients, each result showing a match
  score and the ingredients you'd still need
- **"Almost there" filtering:** only show recipes missing at most *N* ingredients
- **Accounts:** register and log in with email and password
- **A personal pantry** that persists between sessions and is private to each user
- **Matching from your saved pantry**, updating live as you add and remove ingredients
- **A web app** (React) with an ingredient picker, ranked results, recipe details,
  and a pantry screen
- **A tested, hardened API:** 133 automated tests, rate limiting, a CORS
  allowlist, security headers, and schema-validated input
- **Production-ready:** health checks, graceful shutdown, safety checks on
  production settings, structured logs with request ids, and a CI pipeline that
  gates deployment

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, React Router |
| Runtime | Node.js 20.10+ (ES modules) |
| Web framework | Express |
| Database | PostgreSQL, via the `pg` driver |
| Passwords | `bcrypt` (cost 12) |
| Sessions | JSON Web Tokens (`jsonwebtoken`, HS256, 1-hour expiry) |
| Input validation | `zod` |
| Security | `helmet` (headers), `cors` (origin allowlist), `express-rate-limit` |
| Logging | `pino` and `pino-http` (structured JSON logs) |
| Configuration | `dotenv` (server), Vite environment files (client) |
| Automated tests | Node's built-in test runner and `supertest` (server) |
| Manual API testing | Postman |
| CI/CD | GitHub Actions, Dependabot |
| Hosting | Render (API and static site), Neon (PostgreSQL) |

---

## How it works

A full stack app is three programs, each with one job:

```
Browser (React app)  ──HTTP request──▶  Server (Node/Express)  ──SQL──▶  Database (PostgreSQL)
what users see      ◀──JSON response──  rules and logic         ◀─rows──  permanent storage
```

The server sits between users and data because it is the **trust boundary**:
anything running in a browser can be inspected and changed, so secrets, rules, and
ownership checks live on the server. The web app is a convenience layer; it is
never trusted to enforce anything.

### The request pipeline

Every API request passes through the same stages, in this order:

```
request logger → helmet → cors → (health checks) → rate limit → JSON parser → route → (authenticate) → validate → controller → service → database
```

| Stage | Job |
|---|---|
| **request logger** | Assigns a request id, returns it in `X-Request-Id`, and writes one log line per request |
| **helmet** | Adds security headers to every response and removes `X-Powered-By` |
| **cors** | Lets only allowlisted origins read responses; answers preflight requests before authentication |
| **health checks** | `/api/health` and `/api/health/live`, answered before rate limiting |
| **rate limit** | Caps requests per client; stricter limits on login and registration |
| **JSON parser** | Parses bodies, rejecting anything over 10 KB |
| **authenticate** | Verifies the bearer token and sets `req.user` (protected routes only) |
| **validate** | Checks input against a schema and puts the cleaned result on `req.valid` |
| **controller** | Chooses the status code and sends the response |
| **service** | Runs the SQL and shapes the data |

### Server layers

| Layer | Job | Knows about HTTP? | Knows about SQL? |
|---|---|---|---|
| **Routes** | Map a method and URL to a chain of middleware and a controller | Yes | No |
| **Middleware** | Cross-cutting concerns: logging, authentication, validation, rate limiting, errors | Yes | No |
| **Controllers** | Read validated input, choose the status code, send the response | Yes | No |
| **Services** | Run queries and shape the data | **No** | Yes |

Rules the code follows:

- Services never touch `req` or `res`, and only services import the database pool.
- A service reports facts (`null` means "not found"); the controller decides what
  that means in HTTP terms.
- Controllers never check raw input: schemas do, and controllers read `req.valid`.
  Questions that need the database (does this ingredient exist?) stay out of the
  schemas.
- Every SQL value travels as a parameter (`$1`, `$2`). User input is never
  concatenated into a query string.

### Production architecture

```
GitHub ──push──▶ GitHub Actions (tests, lint, build) ──all green──▶ Render deploys

Browser ──HTTPS──▶ Static site (React bundle)
   └────HTTPS────▶ API web service (Express) ──TLS──▶ PostgreSQL (Neon)
```

### Project structure

```
pantry-app/
├── README.md
├── CHANGELOG.md
├── render.yaml               # deployment blueprint (API and web app)
├── .github/
│   ├── workflows/ci.yml      # tests, lint, and build on every push and pull request
│   └── dependabot.yml        # weekly dependency and action updates
├── postman/                  # Postman collection and environment
├── server/
│   ├── .env                  # secrets (never committed)
│   ├── .env.test             # test settings (never committed)
│   ├── package.json
│   ├── src/
│   │   ├── app.js            # builds the Express app and exports it
│   │   ├── server.js         # starts the server; handles shutdown and fatal errors
│   │   ├── config.js         # loads and validates settings
│   │   ├── logger.js         # the shared structured logger
│   │   ├── constants.js      # shared limits
│   │   ├── controllers/      # auth, health, ingredient, pantry, recipe
│   │   ├── db/
│   │   │   ├── pool.js       # the shared PostgreSQL connection pool
│   │   │   ├── schema.sql    # table definitions (idempotent)
│   │   │   ├── seedData.js   # recipes and ingredients
│   │   │   └── seed.js       # applies the schema and data
│   │   ├── middleware/       # requireAuth, validate, rateLimiters, requestLogger, errorHandler, notFound
│   │   ├── routes/           # auth, health, ingredients, pantry, recipes
│   │   ├── services/         # auth, health, token, ingredient, pantry, recipe
│   │   └── validation/       # zod schemas
│   └── tests/                # automated tests and helpers
└── client/
    ├── .env.development      # the API's address for development (not a secret)
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx          # entry point (router and session provider)
        ├── App.jsx           # header and routes
        ├── api.js            # the one place that talks to the API
        ├── auth/             # session context, provider, token storage
        ├── components/       # picker, chips, results, forms, header
        ├── hooks/            # data loading and state logic
        └── pages/            # one component per screen
```

### Data model

```mermaid
erDiagram
    users ||--o{ pantry_items : "has"
    ingredients ||--o{ pantry_items : "stocked in"
    recipes ||--o{ recipe_ingredients : "uses"
    ingredients ||--o{ recipe_ingredients : "appears in"

    users {
        int id PK
        text email UK
        text password_hash
        timestamptz created_at
    }
    ingredients {
        int id PK
        text name UK
    }
    recipes {
        int id PK
        text title UK
        text instructions
        int prep_minutes
    }
    recipe_ingredients {
        int recipe_id PK
        int ingredient_id PK
    }
    pantry_items {
        int user_id PK
        int ingredient_id PK
        timestamptz added_at
    }
```

Recipes and ingredients are many-to-many, as are users and ingredients, so each
relationship has a join table. Foreign keys, unique constraints, and a check that
emails are lowercase make the database the last line of defense against bad data.
Deleting a user removes their pantry rows. Deleting an ingredient that is still in
use is blocked.

---

## Getting started

### Prerequisites

- Node.js 20.19 or newer (the server needs 20.10+, and the client's build tool needs 20.19+)
- PostgreSQL (a local install)
- Git

### 1. Install the server

```bash
cd server
npm install
```

### 2. Create the database

```bash
psql -U postgres -c "CREATE DATABASE pantry;"
```

### 3. Configure the server

Create `server/.env`:

```
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/pantry
JWT_SECRET=<at least 32 random characters>
```

Generate a secret with:

```bash
node -e "console.log(crypto.randomBytes(48).toString('hex'))"
```

Optional settings, all validated at startup:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | The port to listen on; hosting platforms set this for you |
| `NODE_ENV` | `development` | Set to `production` when deployed; this switches on stricter startup checks |
| `LOG_LEVEL` | `debug` (`info` in production) | One of `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins allowed to read API responses. Exact origins only: no path, trailing slash, or wildcard. |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the app (0 to 5). Set this when deployed behind a proxy, never to `true`. |
| `RATE_LIMIT_GENERAL_MAX` | `300` | Requests per 15 minutes per IP, across `/api` |
| `RATE_LIMIT_LOGIN_MAX` | `10` | Failed logins per 15 minutes per IP |
| `RATE_LIMIT_REGISTER_MAX` | `20` | Registrations per hour per IP |
| `BCRYPT_ROUNDS` | `12` | Password hashing cost (4 to 15). Lower values are for tests only. |

Notes:

- `.env` is read once at startup, so **restart the server after changing it**.
- If your database password contains special characters (`@ : / # %`),
  percent-encode them in the URL (for example `@` becomes `%40`).
- The server refuses to start if `JWT_SECRET` is missing or shorter than
  32 characters, or if any optional setting is malformed. Never commit `.env`.
- With `NODE_ENV=production`, it also refuses to start unless `CORS_ORIGINS` is set
  explicitly with `https://` origins only and `BCRYPT_ROUNDS` is at least 10.

### 4. Create the tables and load the data

```bash
npm run db:seed
```

This creates the tables and loads 20 recipes and 28 ingredients. It is
**idempotent**: running it again updates the data and never duplicates it.

### 5. Run the API

```bash
npm run dev
```

Then check it:

```bash
curl http://localhost:3000/api/ingredients
```

(On Windows PowerShell, use `curl.exe`, because `curl` is an alias for a different
command.)

### 6. Run the web app

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. The API must be running, and its `CORS_ORIGINS` must
include `http://localhost:5173` (the default does). The client reads the API's
address from `client/.env.development` (`VITE_API_URL`, default
`http://localhost:3000`); restart the client after changing it.

### Scripts

**Server** (`server/`):

| Script | What it does |
|---|---|
| `npm run dev` | Starts the server and restarts on code changes (`node --watch`) |
| `npm start` | Starts the server |
| `npm run db:seed` | Applies `schema.sql` and loads the seed data (safe to repeat) |
| `npm test` | Runs the automated test suite against the test database |
| `npm run test:coverage` | Runs the suite and prints a coverage report |

**Client** (`client/`):

| Script | What it does |
|---|---|
| `npm run dev` | Starts the Vite dev server on port 5173 |
| `npm run build` | Builds the production bundle into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run lint` | Checks the code with ESLint |

---

## The web app

| Address | Login | What it shows |
|---|---|---|
| `/` | no | Search and tick ingredients, choose how many missing ones are OK, and see ranked recipes |
| `/recipes/:id` | no | A recipe's ingredients and instructions; ingredients are marked "you have this" or "you need this" using your saved pantry when logged in |
| `/login`, `/register` | no | Forms that show the server's validation messages beside each field |
| `/pantry` | **yes** | Your saved pantry; ranked recipes update automatically as you tick and untick |
| `/account` | **yes** | Your email and join date |
| anything else | no | A "Page not found" screen |

How it's built:

- **One API module.** `src/api.js` is the only code that calls `fetch`. It adds the
  token, turns failures into one error type, and reports rejected tokens.
- **Hooks hold the logic, components draw the screen.** Each piece of server data
  has a hook (loading, error, and success state, with cancellation of stale
  requests), and pages stay small.
- **Where state lives.** The home-page selection lives in `App`, so it survives
  moving between screens (but not a reload). Per-user data such as the pantry lives
  inside protected pages, so nothing user-specific survives logout.
- **Optimistic pantry updates.** Ticking an ingredient updates the screen
  immediately and is undone with an error message if the request fails.
- **Text, never HTML.** React inserts recipe text as text, so stored content cannot
  inject markup.

### Sessions in the browser

After login, the token is kept in `localStorage` (key `pantry.token`) and sent with
each request. On reload, a stored token is verified with the server before the app
treats you as logged in. Any `401` on a request that carried a token ends the
session and sends you to the login page, then back to where you were.

**This is a trade-off:** a script running on the page could read the token. The
mitigations are React's escaping, the one-hour expiry, and loading no third-party
scripts. The stronger design, an HttpOnly cookie with refresh tokens, needs changes
on the server.

---

## API overview

The server listens on port 3000 by default (or the `PORT` it is given). All
responses are JSON.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health/live` | none | Liveness: is the process running? |
| GET | `/api/health` | none | Readiness: is the database reachable? (`200` or `503`) |
| GET | `/api/ingredients` | none | List all ingredients |
| GET | `/api/recipes/:id` | none | One recipe with its ingredient names |
| GET | `/api/recipes/match` | none | Rank recipes against ingredient ids in the URL |
| POST | `/api/auth/register` | none | Create an account |
| POST | `/api/auth/login` | none | Log in and receive a token |
| GET | `/api/auth/me` | Bearer | The current user |
| GET | `/api/pantry` | Bearer | List my pantry |
| POST | `/api/pantry` | Bearer | Add an ingredient to my pantry |
| DELETE | `/api/pantry/:ingredientId` | Bearer | Remove an ingredient from my pantry |
| GET | `/api/pantry/matches` | Bearer | Rank recipes against my saved pantry |

Exact request and response details for each endpoint are in
[CHANGELOG.md](CHANGELOG.md), under the version that introduced it.

### Conventions

- Errors are JSON of the form `{ "error": "message" }`, including unknown routes.
- Validation errors (`400`) also include `details`, a list of
  `{ "field", "message" }` entries, one per problem, so a form can show each
  message next to its field.
- Status codes carry meaning:

  | Code | Meaning |
  |---|---|
  | `200` / `201` / `204` | Success / created / success with no body |
  | `400` | The request itself is invalid |
  | `401` | Missing, invalid, or expired token (or bad login) |
  | `404` | The thing doesn't exist (or isn't yours) |
  | `409` | Conflict, such as an email that is already registered |
  | `413` | The JSON body is larger than 10 KB |
  | `429` | Too many requests; see the `Retry-After` header |
  | `500` | Server failure; the client gets a vague message and the details go to the server log |
  | `503` | `/api/health` only: the database is not reachable |

- Every response carries an `X-Request-Id` header; quote it when reporting a
  problem so it can be found in the logs.
- Every `/api` response except the health checks carries `RateLimit` and
  `RateLimit-Policy` headers showing the caller's remaining budget.
- A well-formed query that matches nothing returns `200` with `[]`, not a 404.

### Example: matching

```bash
curl "http://localhost:3000/api/recipes/match?ingredients=1,2&maxMissing=1"
```

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

---

## Authentication

1. `POST /api/auth/register` creates an account. Passwords are stored only as
   bcrypt hashes.
2. `POST /api/auth/login` checks the password and returns a token that is valid
   for one hour.
3. Protected requests send `Authorization: Bearer <token>`.

A token is **signed, not encrypted**: anyone holding it can read its contents, but
no one can alter it without the server's secret. For that reason it carries only
the user's id and an expiry.

**Ownership comes only from the token.** No route accepts a user id from the URL
or request body, and every pantry query is scoped to the token's user. One user
cannot see or change another user's pantry.

---

## Security and hardening

| Protection | How it works |
|---|---|
| **Brute-force limits** | 10 failed logins per 15 minutes per IP, 20 registrations per hour, 300 requests per 15 minutes overall. A blocked client gets `429` with `Retry-After`. Counters live in server memory. |
| **CORS allowlist** | Only origins in `CORS_ORIGINS` can read responses from a browser. This protects users, not the server, and is not a substitute for authentication. |
| **Security headers** | `helmet` sets headers such as `X-Content-Type-Options: nosniff`; `X-Powered-By` is removed. |
| **Input validation** | Every route's input is checked by a schema before the controller runs, with one consistent error format. |
| **Request size limit** | JSON bodies over 10 KB are rejected. |
| **Password handling** | bcrypt hashes; login takes the same time for unknown emails; identical error for a wrong password and an unknown email. |
| **Tokens** | Signed with HS256, one-hour expiry, algorithm pinned on verification. Kept in `localStorage` in the browser (see the trade-off above). |
| **Production startup checks** | With `NODE_ENV=production`, the server refuses to start with a weak bcrypt cost, a missing `CORS_ORIGINS`, or a non-HTTPS origin. |
| **Log hygiene** | Logs name exactly what they record (request id, method, path without the query string, status, timing, user id). Bodies, headers, cookies, tokens, and passwords are never written, and a test enforces it. |
| **No injected markup** | The web app renders stored text as text. `VITE_` variables are public in the browser bundle, so they never hold secrets. |
| **Database as last defense** | Unique constraints, foreign keys, and a lowercase-email check reject bad data even if application code is wrong. |

---

## How matching works

Matching is a single SQL query. Your ingredients become a table (`have`), and a
`LEFT JOIN` against each recipe's ingredient list keeps every ingredient, marking
the ones you lack with `NULL`. Then:

- `COUNT(*)` is the number of ingredients the recipe needs
- `COUNT(have.ingredient_id)` is how many you have
- the score is matched divided by total
- the missing names are collected with `ARRAY_AGG(...) FILTER (WHERE ... IS NULL)`

Results are ordered by score, then by number of matches, then alphabetically, so
the order is deterministic. Recipes where you have nothing are excluded, and the
optional `maxMissing` parameter limits results to recipes missing at most that
many ingredients.

The query is written once. The only difference between the two matching endpoints
is where `have` comes from: ids in the URL, or the user's saved pantry.

---

## Testing

The server has **133 automated tests** and runs against a separate database, so it
never touches your development data. The web app has no automated tests yet.

### One-time setup

1. Create the test database:

   ```bash
   psql -U postgres -c "CREATE DATABASE pantry_test;"
   ```

2. Create `server/.env.test` (and keep it out of Git):

   ```
   DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/pantry_test
   JWT_SECRET=test-only-secret-that-is-at-least-32-characters-long
   BCRYPT_ROUNDS=4
   CORS_ORIGINS=http://allowed.example
   RATE_LIMIT_GENERAL_MAX=10000
   RATE_LIMIT_LOGIN_MAX=5000
   RATE_LIMIT_REGISTER_MAX=1000
   LOG_LEVEL=silent
   ```

   The rate limits are deliberately different from each other and very high, so
   the suite never trips them and tests can tell which limiter handled a route.

### Running

```bash
cd server
npm test
npm run test:coverage
```

To run one file, or only tests whose name matches a word:

```bash
node --env-file=.env.test --test tests/auth.test.js
npm test -- --test-name-pattern="tampered"
```

### What's covered

| File | Tests | What it guards |
|---|---|---|
| `catalog.test.js` | 6 | Public reads, id validation, JSON 404s |
| `auth.test.js` | 24 | Hashing, login rules, token forgery, expiry, deleted accounts |
| `matching.test.js` | 20 | Ranking, scoring, missing ingredients, `maxMissing`, input validation |
| `pantry.test.js` | 32 | Authentication on every route, ownership, idempotency, cascade, pantry matching |
| `errorHandler.test.js` | 4 | Internals never leak to clients; only server errors are logged as errors |
| `security.test.js` | 7 | Headers, CORS allowlist and preflight, body size limit |
| `rateLimit.test.js` | 8 | Limiter behavior, and which limiter guards which route |
| `validation.test.js` | 10 | Error shape, normalization, messages clients rely on |
| `health.test.js` | 6 | Health and liveness checks, and database outages becoming controlled responses |
| `config.test.js` | 7 | Startup checks, run in a fresh process for each case |
| `observability.test.js` | 9 | Request ids, log levels, and that no secrets reach the logs |

### How the tests stay safe and repeatable

- **A guard rail:** the helpers refuse to run unless the database name ends in
  `_test`, before any query executes. Always use `npm test`, which loads
  `.env.test`.
- **Known state:** each file applies the schema, truncates every table
  (restarting ids), and inserts a small fixture set that is independent of the
  production seed data.
- **Files run one at a time**, since they share a database.
- **Failures are simulated, not caused:** database outages are tested by replacing
  `pool.query` with a function that throws.

### Manual testing

For exploring the API by hand, import `postman/pantry-api.postman_collection.json`
and `postman/local.postman_environment.json` into Postman, select the `Local`
environment, and send the requests in folder order (Auth first, so the login
requests can save tokens into the environment). The collection covers
authentication, ingredients, recipes, matching, the pantry, and CORS behavior, with
a test script on each request. The environment ships with empty tokens. Tests catch
regressions; Postman is for exploring.

---

## Continuous integration and deployment

### The pipeline

`.github/workflows/ci.yml` runs on every push to `main` and every pull request.
Two jobs run in parallel, each on a fresh Linux machine:

| Job | What it does |
|---|---|
| **Server tests** | Starts PostgreSQL 16, installs from the lockfile, writes its own `.env.test` (throwaway values only), and runs all 133 tests |
| **Client lint and build** | Installs from the lockfile, runs ESLint, and builds the production bundle |

The workflow has read-only repository permissions, and a newer push cancels an
older run of the same branch. `.github/dependabot.yml` opens weekly pull requests
for outdated server packages, client packages, and GitHub Actions; they run the
same checks.

Because CI starts from a clean machine, it catches things your laptop hides: a file
you forgot to commit, a missing setting, or a filename casing mistake (Windows
ignores case; Linux does not).

### Recommended workflow

1. Make changes on a branch, push it, and open a pull request.
2. Wait for both checks to pass.
3. Merge into `main`. Render then deploys the commit, but only if its checks passed.

In your GitHub repository settings, require both checks before merging into `main`
(if your plan supports it for private repositories).

---

## Deployment

The blueprint in `render.yaml` describes two services: the API (a Node web service)
and the web app (a static site with a single-page-app rewrite rule). The database
is a separate hosted PostgreSQL (Neon). Both Render services deploy automatically
**only after CI checks pass** (`autoDeployTrigger: checksPass`).

### Settings that matter in production

**API service** (set in the Render dashboard; values marked secret are never
written to Git):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (set in the blueprint) |
| `TRUST_PROXY` | `1`, matching the one proxy hop on Render (verify this once; see below) |
| `DATABASE_URL` | The hosted database's **direct** connection string (secret). It must include `sslmode=require`. |
| `JWT_SECRET` | A **new** secret for production, not the one you use locally (secret) |
| `CORS_ORIGINS` | The web app's exact address, for example `https://your-client.onrender.com` (no trailing slash) |

**Web app service:**

| Variable | Value |
|---|---|
| `VITE_API_URL` | The API's `https://` address. **This is embedded when the app is built**, so changing it requires a rebuild (a manual deploy). |

### First deployment, step by step

1. **Push the repository to GitHub.** Check first that `server/.env` and
   `server/.env.test` are not tracked (`git ls-files | Select-String '\.env'` should
   list only `client/.env.development`).
2. **Create the database** at your PostgreSQL host and copy its direct connection
   string.
3. **Load the recipe catalog** from your machine, using the hosted connection string
   for one command only:

   ```powershell
   $env:DATABASE_URL = 'PASTE-THE-CONNECTION-STRING-HERE'
   npm run db:seed
   Remove-Item Env:DATABASE_URL
   ```

4. **Edit the two `CHANGEME` service names** in `render.yaml` (names become part of
   the public address), then commit and push.
5. In Render, create a **Blueprint** from the repository and enter the secret
   values when asked. Use temporary guesses for the two address variables.
6. **Second pass:** once both services exist, set the API's `CORS_ORIGINS` to the
   web app's real address, set the web app's `VITE_API_URL` to the API's real
   address, and redeploy the web app so the new address is built in.

### Verifying a deployment

```powershell
curl.exe -i https://pantry-api-ag.onrender.com/api/health/live
curl.exe -i https://pantry-api-ag.onrender.com/api/health
curl.exe -i -H "Origin: https://pantry-client-ag.onrender.com" https://pantry-api-ag.onrender.com/api/ingredients
```

You should see `200` from both health checks (`"database":"up"` from the second),
and on the third a matching `Access-Control-Allow-Origin`, a
`Strict-Transport-Security` header, and no `X-Powered-By`. Then register in the web
app, build a pantry, and refresh a deep link such as `/recipes/2` to confirm the
rewrite rule works.

**Check `TRUST_PROXY` once.** Temporarily log `req.ip` in the health handler, call
the API from your own machine, and compare the logged address with your public IP.
If it shows an internal address, raise `TRUST_PROXY`; if everyone is rate limited at
once, it is too low. Remove the log line afterward.

### What to expect on the free plans

The API sleeps after about 15 idle minutes, and waking takes around a minute; the
database also sleeps and wakes in a few seconds. The first request after a quiet
period is therefore slow. An uptime monitor pinging `/api/health/live` keeps the API
awake but uses its free hours, and pinging the deep `/api/health` often would also
keep the database awake and use its compute allowance. Free-plan limits change, so
check each provider's current terms.

---

## Observability

- **Structured logs.** Each request writes one JSON line (request id, method, path,
  status, response time, and the numeric user id when logged in) at a level that
  follows the status: `info` for 2xx and 3xx, `warn` for 4xx, `error` for 5xx. In a
  terminal during development the logs are colorized and readable; elsewhere they
  are raw JSON. Set `LOG_LEVEL` to change the verbosity.
- **Request ids.** Every response includes `X-Request-Id`. To investigate a report,
  get the id (browser Network tab, or from the user) and search the logs for it. If
  a caller sends a safe `X-Request-Id` (8 to 64 letters, digits, or dashes), it is
  reused; anything else is replaced.
- **Server errors keep their details server-side.** A 5xx logs the real error and
  stack trace with the request id, while the client only sees "Something went
  wrong."
- **Health checks.** `/api/health/live` says the process is running and is what the
  hosting platform probes. `/api/health` also checks the database and returns `503`
  with no error text when it cannot answer. Neither is rate limited, and the
  liveness check is not logged.
- **Monitoring.** Point an uptime monitor at `/api/health/live` (a free plan with
  5-minute checks is enough) and send alerts to your email. Confirm the alert path
  works by pointing a second monitor at a URL that returns 404 and watching it
  alert, then delete it.
- **Shutdown and crashes.** On `SIGTERM` or `SIGINT` the server finishes in-flight
  requests, closes the database pool, and exits. Unhandled errors are logged as
  `fatal` before the process exits.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `password authentication failed` | The password in `DATABASE_URL` doesn't match your PostgreSQL user. Check it with `psql`, then restart the server. |
| `client password must be a string` | `DATABASE_URL` is missing from the environment, or lacks a password. Check `.env`'s location (`server/.env`) and name, then restart. |
| `ECONNREFUSED` | PostgreSQL isn't running, or the port in `DATABASE_URL` is wrong. |
| `database "pantry" does not exist` | Create it (step 2 of Getting started). |
| `relation "..." does not exist` | Run `npm run db:seed`. |
| `JWT_SECRET must be set...` on startup | Add a secret of at least 32 characters to `.env` and restart. |
| `CORS_ORIGINS must be...` on startup | An entry has a path, a trailing slash, or is a wildcard, or (in production) is missing or not `https://`. Use exact origins like `https://your-client.onrender.com`. |
| `BCRYPT_ROUNDS must be at least 10 in production` | A test setting leaked into production: remove `BCRYPT_ROUNDS` or set it to 10 or more. |
| `LOG_LEVEL must be one of...` on startup | A typo in `LOG_LEVEL`. |
| Changes to `.env` have no effect | It is read once at startup. Stop and restart the server. |
| `401` on a protected route | The token is missing, malformed, or expired (tokens last one hour). Log in again. |
| `429 Too many requests` while testing by hand | A rate limit tripped. Restart the dev server to reset the in-memory counters, or raise the limits in `.env`. |
| Everyone gets `429` at once in production | `TRUST_PROXY` is too low, so all users look like one address. Check it as described under Deployment. |
| Web app shows "Could not reach the server" | The API isn't running, or the browser blocked the request. Open the browser console: **CORS policy** means the page's origin isn't in `CORS_ORIGINS`; `ERR_CONNECTION_REFUSED` means the API is down or `VITE_API_URL` is wrong. |
| Browser console says **Content Security Policy** | The *page* is blocking the request (not the API). Check the page's own headers. |
| Requests go to `undefined/api/...` | `client/.env.development` is missing or misnamed, or (in production) `VITE_API_URL` was not set before the build. Set it and redeploy the web app. |
| Vite says port 5173 is already in use | Another dev server holds the port. Close it; the client is pinned to 5173 because the API's default CORS allowlist expects it. |
| You are logged out unexpectedly | The token expired (one hour) or the server's `JWT_SECRET` changed. Log in again. |
| First request in production hangs for about a minute | The free-plan cold start: the API (and then the database) is waking up. |
| `/api/health` returns `503` but `/api/health/live` is fine | The database is unreachable or still waking. Check `DATABASE_URL`, then retry after a few seconds. |
| Refreshing `/recipes/2` gives a 404 in production | The static site's rewrite rule (`/*` to `/index.html`) is missing. |
| CI fails with `Cannot find module` on a path that works locally | A filename casing mismatch (Linux is case-sensitive). Make the import match the real name. |
| CI fails with `node: .env.test: not found` | The workflow's "Create the test environment file" step is missing or ran in the wrong folder. |
| Render never deploys after a push | No CI checks were detected for the commit, or a check failed. Open the GitHub Actions tab. |
| `Refusing to run tests: database "..." does not end with "_test"` | You ran the tests without `.env.test`. Use `npm test`. |
| `bad option: --env-file` | Node is older than 20.10. Update it. |
| PowerShell says `Supply values for the following parameters` after `curl` | `curl` is an alias for `Invoke-WebRequest`. Use `curl.exe`, or Postman. |

---

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundations: client/server model, first Express server | Done |
| 2 | Data and structure: schema, Postgres connection, layered structure, error handling | Done |
| 3 | Recipes: detail endpoint, seed data | Done |
| 4 | Matching: ranking, missing ingredients, `maxMissing` | Done |
| 5 | Users and persistence: accounts, authentication, per-user pantry, matching from the pantry | Done |
| 6 | Quality and hardening: automated tests, security headers, CORS, rate limiting, schema validation | Done |
| 7 | Frontend: React app, ingredient picker, results, recipe detail, accounts, saved pantry | Done |
| 8 | Shipping: production readiness, deployment, CI/CD, logging and monitoring | Done |

Ideas for what could come next: automated tests for the web app (Vitest and React
Testing Library), an error-tracking service, a database migration tool, a staging
environment, cookie-based sessions with refresh tokens, bulk pantry operations,
and an accessibility audit.

## Known limitations

- On the free hosting plans, the API and the database both sleep when idle, so the
  first request after a quiet period is slow.
- No automated tests for the web app, and no staging environment: a commit that
  passes CI deploys to production.
- No error-tracking service, metrics, or dashboards: monitoring is an uptime ping
  with email alerts, plus searchable logs on the hosting platform.
- No migration tool: `schema.sql` creates missing tables safely but cannot alter
  existing ones, so a column change needs manual SQL. No backup or restore
  procedure is documented for the hosted database.
- The token is stored in `localStorage`, where any script on the page could read
  it. Tokens cannot be revoked before they expire, and there is no refresh token,
  password reset, or email verification.
- Rate-limit counters are in memory: they reset on restart and aren't shared
  between multiple server instances. Limits are per IP, so users sharing an
  address share a budget, and there is no per-account lockout.
- The home-page selection is lost on reload.
- The pantry records only presence, with no quantities or expiry dates, and has no
  bulk operations.
- Ingredient names are matched exactly, with no synonyms.
- Accessibility covers the basics (labels, roles, keyboard-operable controls) but
  has not been audited.
- The site runs on the hosting platform's domain, not a custom one.

## Changelog

Every phase is recorded as a version in [CHANGELOG.md](CHANGELOG.md): what was
added or changed, how it behaves, how to upgrade, and what's still missing.