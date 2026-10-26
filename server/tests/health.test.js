import { describe, it, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/db/pool.js';
import { api, resetDatabase, closeDatabase } from './helpers.js';

describe('health and failure handling', () => {
  before(resetDatabase);
  after(closeDatabase);
  afterEach(() => mock.restoreAll());

  it('reports ok when the database is reachable', async () => {
    const res = await api.get('/api/health');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', database: 'up' });
  });

  it('is not rate limited', async () => {
    const res = await api.get('/api/health');

    assert.equal(res.headers['ratelimit-policy'], undefined);
  });

  it('answers 503 without details when the database is down', async () => {
    mock.method(pool, 'query', async () => {
      throw new Error('connection refused to 10.0.0.5:5432');
    });

    const res = await api.get('/api/health');

    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { status: 'degraded', database: 'down' });
  });

  it('turns a database failure on a normal route into a controlled 500', async () => {
    mock.method(console, 'error', () => {});
    mock.method(pool, 'query', async () => {
      throw new Error('connection refused to 10.0.0.5:5432');
    });

    const res = await api.get('/api/ingredients');

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Something went wrong' });
  });
});