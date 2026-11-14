import { defineConfig, devices } from '@playwright/test';

// Not 3000/5173, so a dev server you left running is never mistaken for the test servers.
const API_PORT = 3100;
const WEB_PORT = 5174;

const E2E_DATABASE_NAME = 'pantry_e2e';

// The tests create users. Refuse to start unless the database is the e2e one,
// so a missing or copied URL can never point them at your dev data.
function readDatabaseUrl() {
  const value = process.env.E2E_DATABASE_URL;
  const example = `postgres://lasto:PASSWORD@localhost:5432/${E2E_DATABASE_NAME}`;

  if (!value) {
    throw new Error(`E2E_DATABASE_URL is not set. Set it to the e2e database, for example ${example}`);
  }

  let parsed = null;
  try {
    parsed = new URL(value);
  } catch {
    // reported below
  }

  if (!parsed || parsed.pathname !== `/${E2E_DATABASE_NAME}`) {
    throw new Error(
      `E2E_DATABASE_URL must point at a database named ${E2E_DATABASE_NAME}, for example ${example}`
    );
  }

  return value;
}

const databaseUrl = readDatabaseUrl();

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    timezoneId: 'America/New_York',
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Migrations and the 20 recipes / 28 ingredients, then the API.
      command: 'npm run db:seed && npm start',
      cwd: '../server',
      url: `http://localhost:${API_PORT}/api/health/live`,
      reuseExistingServer: false,
      timeout: 60_000,
      // Every value server/.env sets is set here too, so server/.env (your dev database)
      // can't fill a gap: dotenv never overwrites a variable that is already set.
      env: {
        ...process.env,
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrl,
        JWT_SECRET: 'e2e-only-secret-that-is-at-least-32-characters-long',
        BCRYPT_ROUNDS: '4',
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        RATE_LIMIT_GENERAL_MAX: '10000',
        RATE_LIMIT_LOGIN_MAX: '5000',
        RATE_LIMIT_REGISTER_MAX: '1000',
        LOG_LEVEL: 'silent',
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      cwd: '../client',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      // A shell variable beats client/.env.development (http://localhost:3000).
      env: { ...process.env, VITE_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
