import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createLimiter } from '../src/middleware/rateLimiters.js';
import { api, closeDatabase } from './helpers.js';

function buildApp(limiterOptions) {
  const app = express();
  app.use(express.json());

  app.post('/attempt', createLimiter(limiterOptions), (req, res) => {
    res.status(req.body.ok ? 200 : 401).json({ ok: Boolean(req.body.ok) });
  });
  app.get('/other', (req, res) => res.json({ other: true }));

  return app;
}

const fail = { ok: false };
const succeed = { ok: true };

describe('rate limiting', () => {
  after(closeDatabase);

  describe('limiter behavior (isolated app)', () => {
    it('allows requests up to the limit, then answers 429 with JSON and Retry-After', async () => {
      const app = buildApp({ windowMs: 60_000, limit: 3, message: 'Too many attempts.' });

      const statuses = [];
      for (let i = 0; i < 3; i += 1) {
        statuses.push((await request(app).post('/attempt').send(fail)).status);
      }
      const blocked = await request(app).post('/attempt').send(fail);

      assert.deepEqual(statuses, [401, 401, 401]);
      assert.equal(blocked.status, 429);
      assert.deepEqual(blocked.body, { error: 'Too many attempts.' });
      assert.match(blocked.headers['retry-after'], /^\d+$/);
    });

    it('reports the remaining budget in the RateLimit header', async () => {
      const app = buildApp({ windowMs: 60_000, limit: 3, message: 'x' });

      const first = await request(app).post('/attempt').send(fail);
      const second = await request(app).post('/attempt').send(fail);

      assert.match(first.headers.ratelimit, /remaining=2/);
      assert.match(second.headers.ratelimit, /remaining=1/);
    });

    it('counts only failed attempts when skipSuccessfulRequests is on', async () => {
      const app = buildApp({
        windowMs: 60_000,
        limit: 2,
        message: 'x',
        skipSuccessfulRequests: true,
      });

      for (let i = 0; i < 5; i += 1) {
        const ok = await request(app).post('/attempt').send(succeed);
        assert.equal(ok.status, 200);
      }

      const first = await request(app).post('/attempt').send(fail);
      const second = await request(app).post('/attempt').send(fail);
      const third = await request(app).post('/attempt').send(fail);

      assert.equal(first.status, 401);
      assert.equal(second.status, 401);
      assert.equal(third.status, 429);
    });

    it('counts every request when skipSuccessfulRequests is off', async () => {
      const app = buildApp({ windowMs: 60_000, limit: 2, message: 'x' });

      const first = await request(app).post('/attempt').send(succeed);
      const second = await request(app).post('/attempt').send(succeed);
      const third = await request(app).post('/attempt').send(succeed);

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(third.status, 429);
    });

    it('does not limit routes it is not attached to', async () => {
      const app = buildApp({ windowMs: 60_000, limit: 1, message: 'x' });

      await request(app).post('/attempt').send(fail);
      const blocked = await request(app).post('/attempt').send(fail);
      const other = await request(app).get('/other');

      assert.equal(blocked.status, 429);
      assert.equal(other.status, 200);
    });
  });

  describe('wiring in the real app', () => {
    it('protects login with the login limiter', async () => {
      const res = await api.post('/api/auth/login').send({});

      assert.equal(res.status, 400);
      assert.match(res.headers['ratelimit-policy'], /^5000;w=900/);
    });

    it('protects registration with the register limiter', async () => {
      const res = await api.post('/api/auth/register').send({});

      assert.equal(res.status, 400);
      assert.match(res.headers['ratelimit-policy'], /^1000;w=3600/);
    });

    it('applies the general limiter to the rest of the API', async () => {
      const res = await api.get('/api/nothing');

      assert.equal(res.status, 404);
      assert.match(res.headers['ratelimit-policy'], /^10000;w=900/);
    });
  });
});