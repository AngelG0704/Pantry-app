# Pantry App

Tell the app what's in your kitchen, and it tells you what you can cook, ranked by
how many ingredients you already have and listing exactly what's missing.

**Status:** the backend (API, database, accounts, per-user pantry, recipe matching)
is complete, tested, and hardened through **v0.6.0**. The frontend and deployment
are planned. See the [Roadmap](#roadmap).

Version history lives in [CHANGELOG.md](CHANGELOG.md).

---

## Features

- **Browse** ingredients and recipes, with each recipe's ingredient list
- **Match** recipes against a set of ingredients, each result showing a match
  score and the ingredients you'd still need
- **"Almost there" filtering:** only show recipes missing at most *N* ingredients
- **Accounts:** register and log in with email and password
- **A personal pantry** that persists between sessions and is private to each user
- **Matching from your saved pantry**, so the app already knows what you have
- **A tested, hardened API:** 111 automated tests, rate limiting, a CORS
  allowlist, security headers, and schema-validated input

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20.10+ (ES modules) |
| Web framework | Express |
| Database | PostgreSQL, via the `pg` driver |
| Passwords | `bcrypt` (cost 12) |
| Sessions | JSON Web Tokens (`jsonwebtoken`, HS256, 1-hour expiry) |
| Input validation | `zod` |
| Security | `helmet` (headers), `cors` (origin allowlist), `express-rate-limit` |
| Configuration | `dotenv` |
| Automated tests | Node's built-in test runner and `supertest` |
| Manual API testing | Postman |
| Frontend | React (planned) |

---

## How it works

A full stack app is three programs, each with one job:

```
Browser (client)  ──HTTP request──▶  Server (Node/Express)  ──SQL──▶  Database (PostgreSQL)
what users see   ◀──JSON response──  rules and logic         ◀─rows──  permanent storage
```

The server sits between users and data because it is the **trust boundary**:
anything running in a browser can be inspected and changed, so secrets, rules, and
ownership checks live on the server.

### The request pipeline

Every request passes through the same stages, in this order:

```
helmet → cors → rate limit → JSON parser → route → (authenticate) → validate → controller → service → database
```

| Stage | Job |
|---|---|
| **helmet** | Adds security headers to every response and removes `X-Powered-By` |
| **cors** | Lets only allowlisted origins read responses; answers preflight requests before authentication |
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
| **Middleware** | Cross-cutting concerns: authentication, validation, rate limiting, errors | Yes | No |
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

### Project structure

```
pantry-app/
├── README.md
├── CHANGELOG.md
├── postman/                  # Postman collection and environment
├── server/
│   ├── .env                  # secrets (never committed)
│   ├── .env.test             # test settings (never committed)
│   ├── package.json
│   ├── src/
│   │   ├── app.js            # builds the Express app and exports it
│   │   ├── server.js         # starts the server
│   │   ├── config.js         # loads and validates settings
│   │   ├── constants.js      # shared limits
│   │   ├── controllers/      # auth, ingredient, pantry, recipe
│   │   ├── db/
│   │   │   ├── pool.js       # the shared PostgreSQL connection pool
│   │   │   ├── schema.sql    # table definitions (idempotent)
│   │   │   ├── seedData.js   # recipes and ingredients
│   │   │   └── seed.js       # applies the schema and data
│   │   ├── middleware/       # requireAuth, validate, rateLimiters, errorHandler, notFound
│   │   ├── routes/           # auth, ingredients, pantry, recipes
│   │   ├── services/         # auth, token, ingredient, pantry, recipe
│   │   └── validation/       # zod schemas
│   └── tests/                # automated tests and helpers
└── client/                   # planned
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

- Node.js 20.10 or newer
- PostgreSQL (a local install)
- Git

All commands below run from the `server/` folder unless noted.

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Create the database

```bash
psql -U postgres -c "CREATE DATABASE pantry;"
```

### 3. Configure environment variables

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

### 4. Create the tables and load the data

```bash
npm run db:seed
```

This creates the tables and loads 20 recipes and 28 ingredients. It is
**idempotent**: running it again updates the data and never duplicates it.

### 5. Run the server

```bash
npm run dev
```

Then check it:

```bash
curl http://localhost:3000/api/ingredients
```

(On Windows PowerShell, use `curl.exe`, because `curl` is an alias for a different
command.)

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the server and restarts on code changes (`node --watch`) |
| `npm start` | Starts the server |
| `npm run db:seed` | Applies `schema.sql` and loads the seed data (safe to repeat) |
| `npm test` | Runs the automated test suite against the test database |
| `npm run test:coverage` | Runs the suite and prints a coverage report |

---

## API overview

The server listens on port 3000. All responses are JSON.

| Method | Path | Auth | Description |
|---|---|---|---|
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

- Every `/api` response carries `RateLimit` and `RateLimit-Policy` headers showing
  the caller's remaining budget.
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
| **Tokens** | Signed with HS256, one-hour expiry, algorithm pinned on verification. |
| **Database as last defense** | Unique constraints, foreign keys, and a lowercase-email check reject bad data even if application code is wrong. |

When deploying behind a reverse proxy, set `TRUST_PROXY` to the number of proxies
so rate limits see each client's real address.

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

The suite has **111 automated tests** and runs against a separate database, so it
never touches your development data.

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
   ```

   The rate limits are deliberately different from each other and very high, so
   the suite never trips them and tests can tell which limiter handled a route.

### Running

```bash
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
| `errorHandler.test.js` | 4 | Internals never leak to clients |
| `security.test.js` | 7 | Headers, CORS allowlist and preflight, body size limit |
| `rateLimit.test.js` | 8 | Limiter behavior, and which limiter guards which route |
| `validation.test.js` | 10 | Error shape, normalization, messages clients rely on |

### How the tests stay safe and repeatable

- **A guard rail:** the helpers refuse to run unless the database name ends in
  `_test`, before any query executes. Always use `npm test`, which loads
  `.env.test`.
- **Known state:** each file applies the schema, truncates every table
  (restarting ids), and inserts a small fixture set that is independent of the
  production seed data.
- **Files run one at a time**, since they share a database.

### Manual testing

For exploring the API by hand, import `postman/pantry-api.postman_collection.json`
and `postman/local.postman_environment.json` into Postman, select the `Local`
environment, and send the requests in folder order (Auth first, so the login
requests can save tokens into the environment). The collection covers
authentication, ingredients, recipes, matching, the pantry, and CORS behavior, with
a test script on each request. The environment ships with empty tokens. Tests catch
regressions; Postman is for exploring.

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
| `CORS_ORIGINS must be a comma-separated list...` on startup | An entry has a path, a trailing slash, or is a wildcard. Use exact origins like `http://localhost:5173`. |
| Changes to `.env` have no effect | It is read once at startup. Stop and restart the server. |
| `401` on a protected route | The token is missing, malformed, or expired (tokens last one hour). Log in again. |
| `429 Too many requests` while testing by hand | A rate limit tripped. Restart the dev server to reset the in-memory counters, or raise the limits in `.env`. |
| Browser console says **CORS policy** | The page's origin isn't in `CORS_ORIGINS`. Add it and restart. |
| Browser console says **Content Security Policy** | The *page* is blocking the request (not the API). Check the page's own headers. |
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
| 7 | Frontend: React client, ingredient picker, results view, login flow | Planned |
| 8 | Shipping: deployment, CI/CD, logging and monitoring | Planned |

## Known limitations

- No frontend yet.
- HTTPS is not enforced yet (deployment phase). Passwords and tokens are only safe
  over HTTPS, and the HSTS header only takes effect once the API is served over it.
- Rate-limit counters are in memory: they reset on restart and aren't shared
  between multiple server instances. Limits are per IP, so users sharing an
  address share a budget, and there is no per-account lockout.
- Tokens cannot be revoked before they expire, and there is no logout, refresh
  token, password reset, or email verification.
- No CI pipeline yet, and the tests don't simulate a database outage.
- The pantry records only presence, with no quantities or expiry dates.
- Ingredient names are matched exactly, with no synonyms.

## Changelog

Every phase is recorded as a version in [CHANGELOG.md](CHANGELOG.md): what was
added or changed, how it behaves, how to upgrade, and what's still missing.
