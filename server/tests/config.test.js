import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const configUrl = pathToFileURL(path.resolve('src/config.js')).href;

const baseEnv = { ...process.env };
for (const name of [
  'NODE_ENV',
  'NODE_TEST_CONTEXT',
  'PORT',
  'CORS_ORIGINS',
  'BCRYPT_ROUNDS',
  'TRUST_PROXY',
  'RATE_LIMIT_GENERAL_MAX',
  'RATE_LIMIT_LOGIN_MAX',
  'RATE_LIMIT_REGISTER_MAX',
]) {
  delete baseEnv[name];
}
baseEnv.JWT_SECRET = 'a-valid-secret-that-is-at-least-32-characters';

function loadConfig(overrides = {}) {
  try {
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(configUrl)})`],
      {
        cwd: tmpdir(),
        env: { ...baseEnv, ...overrides },
        stdio: 'pipe',
        encoding: 'utf8',
      }
    );
    return { ok: true, error: '' };
  } catch (err) {
    return { ok: false, error: String(err.stderr) };
  }
}

const HTTPS_ORIGIN = 'https://pantry.example';

const cases = [
  ['accepts the development defaults', {}, true, null],
  [
    'accepts valid production settings',
    { NODE_ENV: 'production', CORS_ORIGINS: HTTPS_ORIGIN },
    true,
    null,
  ],
  [
    'refuses production without CORS_ORIGINS',
    { NODE_ENV: 'production' },
    false,
    /CORS_ORIGINS must be set/,
  ],
  [
    'refuses production with a non-https origin',
    { NODE_ENV: 'production', CORS_ORIGINS: 'http://pantry.example' },
    false,
    /https/,
  ],
  [
    'refuses production with a weak bcrypt cost',
    { NODE_ENV: 'production', CORS_ORIGINS: HTTPS_ORIGIN, BCRYPT_ROUNDS: '4' },
    false,
    /BCRYPT_ROUNDS/,
  ],
  ['refuses an invalid PORT', { PORT: '99999' }, false, /PORT/],
];

describe('configuration checks at startup', () => {
  for (const [name, env, shouldLoad, pattern] of cases) {
    it(name, () => {
      const result = loadConfig(env);

      assert.equal(result.ok, shouldLoad, result.error);
      if (!shouldLoad) {
        assert.match(result.error, pattern);
      }
    });
  }
});