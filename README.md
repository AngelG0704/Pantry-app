# Pantry App

Tell the app what's in your kitchen, and it tells you what you can cook, ranked by
how many ingredients you already have and listing exactly what's missing.

**Status:** the backend (API, database, accounts, per-user pantry, recipe matching)
is complete through **v0.5.0**. Testing and hardening, the frontend, and
deployment are planned. See the [Roadmap](#roadmap).

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

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ (ES modules) |
| Web framework | Express |
| Database | PostgreSQL, via the `pg` driver |
| Passwords | `bcrypt` (cost 12) |
| Sessions | JSON Web Tokens (`jsonwebtoken`, HS256, 1-hour expiry) |
| Configuration | `dotenv` |
| API testing | Postman (manual); `supertest` planned |
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

### Server layers

Each request passes through layers that each do one job:

```
request → route → controller → service → database
response ← route ← controller ← service ← database
```

| Layer | Job | Knows about HTTP? | Knows about SQL? |
|---|---|---|---|
| **Routes** | Map a method and URL to a controller | Yes | No |
| **Controllers** | Validate input, choose the status code, send the response | Yes | No |
| **Services** | Run queries and shape the data | **No** | Yes |
| **Middleware** | Cross-cutting concerns (authentication, errors, 404s) | Yes | No |

Rules the code follows:

- Services never touch `req` or `res`, and only services import the database pool.
- A service reports facts (`null` means "not found"); the controller decides what
  that means in HTTP terms.
- Every SQL value travels as a parameter (`$1`, `$2`). User input is never
  concatenated into a query string.

### Project structure

```
pantry-app/
├── README.md
├── CHANGELOG.md
├── server/
│   ├── .env                  # secrets (never committed)
│   ├── package.json
│   └── src/
│       ├── app.js            # assembles middleware and routers, starts the server
│       ├── config.js         # loads and validates JWT_SECRET
│       ├── constants.js      # shared limits
│       ├── controllers/      # auth, ingredient, pantry, recipe
│       ├── db/
│       │   ├── pool.js       # the shared PostgreSQL connection pool
│       │   ├── schema.sql    # table definitions (idempotent)
│       │   ├── seedData.js   # recipes and ingredients
│       │   └── seed.js       # applies the schema and data
│       ├── middleware/       # requireAuth, errorHandler, notFound
│       ├── routes/           # auth, ingredients, pantry, recipes
│       ├── services/         # auth, token, ingredient, pantry, recipe
│       └── utils/            # parseMaxMissing
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

- Node.js 20 or newer
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

Notes:

- `.env` is read once at startup, so **restart the server after changing it**.
- If your database password contains special characters (`@ : / # %`),
  percent-encode them in the URL (for example `@` becomes `%40`).
- The server refuses to start if `JWT_SECRET` is missing or shorter than
  32 characters. Never commit `.env`.

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
- Status codes carry meaning:

  | Code | Meaning |
  |---|---|
  | `200` / `201` / `204` | Success / created / success with no body |
  | `400` | The request itself is invalid |
  | `401` | Missing, invalid, or expired token (or bad login) |
  | `404` | The thing doesn't exist (or isn't yours) |
  | `409` | Conflict, such as an email that is already registered |
  | `500` | Server failure; the client gets a vague message and the details go to the server log |

- A well-formed query that matches nothing returns `200` with `[]`, not a 404.

### Example: matching

```bash
curl "http://localhost:3000/api/recipes/match?ingredients=1,2&maxMissing=1"
```

```json
[
  {
    "id": 1,
    "title": "Scrambled