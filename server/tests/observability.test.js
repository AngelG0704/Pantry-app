import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { createRequestLogger } from '../src/middleware/requestLogger.js';
import { api, closeDatabase } from './helpers.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function buildLoggedApp() {
  const lines = [];
  const stream = {
    write(line) {
      lines.push(JSON.parse(line));
    },
  };
  const logger = pino({ level: 'info' }, stream);

  const app = express();
  app.use(createRequestLogger(logger));
  app.use(express.json());

  app.post('/login', (req, res) => res.json({ ok: true }));
  app.get('/missing', (req, res) => res.status(404).json({ error: 'nope' }));
  app.get('/boom', (req, res) => res.status(500).json({ error: 'boom' }));
  app.get('/me', (req, res) => {
    req.user = { id: 42 };
    res.json({ ok: true });
  });
  app.get('/api/health/live', (req, res) => res.json({ status: 'ok' }));

  return { app, lines };
}

// A response's log line is written when the response finishes; give it a tick.
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('observability', () => {
  after(closeDatabase);

  describe('request ids (real app)', () => {
    it('stamps every response with a fresh request id', async () => {
      const res = await api.get('/api/nothing');

      assert.match(res.headers['x-request-id'], UUID);
    });

    it('reuses a safe request id sent by the caller', async () => {
      const res = await api
        .get('/api/nothing')
        .set('X-Request-Id', 'abc12345-def-0001');

      assert.equal(res.headers['x-request-id'], 'abc12345-def-0001');
    });

    it('replaces an unsafe request id with a fresh one', async () => {
      const res = await api
        .get('/api/nothing')
        .set('X-Request-Id', 'bad id with spaces');

      assert.notEqual(res.headers['x-request-id'], 'bad id with spaces');
      assert.match(res.headers['x-request-id'], UUID);
    });

    it('lets browsers read the request id on cross-origin requests', async () => {
      const res = await api
        .get('/api/nothing')
        .set('Origin', 'http://allowed.example');

      assert.match(res.headers['access-control-expose-headers'], /X-Request-Id/i);
    });
  });

  describe('log lines (isolated app)', () => {
    it('writes one line per request with method, path, status, id, and timing', async () => {
      const { app, lines } = buildLoggedApp();

      const res = await request(app)
        .post('/login?token=abc')
        .send({ email: 'a@example.com', password: 'hunter2' });
      await settle();

      assert.equal(lines.length, 1);
      const [line] = lines;
      assert.equal(line.req.method, 'POST');
      assert.equal(line.req.path, '/login');
      assert.equal(line.res.statusCode, 200);
      assert.equal(line.req.id, res.headers['x-request-id']);
      assert.equal(typeof line.responseTime, 'number');
    });

    it('never writes secrets: bodies, query strings, tokens, or cookies', async () => {
      const { app, lines } = buildLoggedApp();

      await request(app)
        .post('/login?token=query-secret-789')
        .set('Authorization', 'Bearer header-secret-123')
        .set('Cookie', 'session=cookie-secret-456')
        .send({ email: 'a@example.com', password: 'hunter2' });
      await settle();

      const everything = JSON.stringify(lines);
      assert.doesNotMatch(
        everything,
        /hunter2|header-secret-123|cookie-secret-456|query-secret-789/
      );
    });

    it('logs successes as info, client errors as warn, and server errors as error', async () => {
      const { app, lines } = buildLoggedApp();

      await request(app).get('/me');
      await request(app).get('/missing');
      await request(app).get('/boom');
      await settle();

      assert.deepEqual(
        lines.map((line) => line.level),
        [30, 40, 50]
      );
    });

    it('does not log the liveness check', async () => {
      const { app, lines } = buildLoggedApp();

      await request(app).get('/api/health/live');
      await settle();

      assert.equal(lines.length, 0);
    });

    it('records the user id (and nothing else about the user) for authenticated requests', async () => {
      const { app, lines } = buildLoggedApp();

      await request(app).get('/me');
      await settle();

      assert.equal(lines[0].userId, 42);
    });
  });
});