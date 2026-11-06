import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, resetDatabase, closeDatabase } from './helpers.js';

const ALLOWED = 'http://allowed.example';
const NOT_ALLOWED = 'http://evil.example';

describe('security hardening', () => {
  before(resetDatabase);
  after(closeDatabase);

  describe('response headers', () => {
    it('does not advertise the framework', async () => {
      const res = await api.get('/api/ingredients');

      assert.equal(res.headers['x-powered-by'], undefined);
    });

    it('tells browsers not to guess content types', async () => {
      const res = await api.get('/api/ingredients');

      assert.equal(res.headers['x-content-type-options'], 'nosniff');
    });
  });

  describe('CORS', () => {
    it('lets a listed origin read responses', async () => {
      const res = await api.get('/api/ingredients').set('Origin', ALLOWED);

      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], ALLOWED);
      assert.match(res.headers.vary, /Origin/);
    });

    it('sends no permission to an unlisted origin, but still serves the request', async () => {
      const res = await api.get('/api/ingredients').set('Origin', NOT_ALLOWED);

      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    it('answers a preflight for a listed origin without needing a token', async () => {
      const res = await api
        .options('/api/pantry')
        .set('Origin', ALLOWED)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type');

      assert.equal(res.status, 204);
      assert.equal(res.headers['access-control-allow-origin'], ALLOWED);
      assert.match(res.headers['access-control-allow-methods'], /POST/);
      assert.match(res.headers['access-control-allow-headers'], /Authorization/i);
    });

    // Every method a route uses must be in the CORS list, or browsers block it.
    // supertest ignores CORS, so route tests alone can't catch a missing method.
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      it(`allows ${method} in a preflight from a listed origin`, async () => {
        const res = await api
          .options('/api/pantry/1')
          .set('Origin', ALLOWED)
          .set('Access-Control-Request-Method', method)
          .set('Access-Control-Request-Headers', 'authorization,content-type');

        assert.equal(res.status, 204);
        const allowed = res.headers['access-control-allow-methods'].split(',');
        assert.ok(allowed.includes(method), `${method} missing from: ${allowed}`);
      });
    }

    it('gives an unlisted origin no permission in a preflight', async () => {
      const res = await api
        .options('/api/pantry')
        .set('Origin', NOT_ALLOWED)
        .set('Access-Control-Request-Method', 'POST');

      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });
  });

  describe('request size', () => {
    it('rejects an oversized JSON body with 413', async () => {
      const res = await api
        .post('/api/auth/login')
        .send({ email: 'a@example.com', password: 'a'.repeat(20000) });

      assert.equal(res.status, 413);
      assert.equal(typeof res.body.error, 'string');
    });
  });
});