import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  api,
  bearer,
  createUserAndToken,
  resetDatabase,
  closeDatabase,
  PASSWORD,
} from './helpers.js';

describe('request validation', () => {
  let session;

  before(async () => {
    await resetDatabase();
    session = await createUserAndToken('validator@example.com');
  });
  after(closeDatabase);

  describe('error shape', () => {
    it('reports every problem at once, with the field each belongs to', async () => {
      const res = await api
        .post('/api/auth/register')
        .send({ email: 'nope', password: 'short' });

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');

      const fields = [...new Set(res.body.details.map((detail) => detail.field))];
      assert.deepEqual(fields.sort(), ['email', 'password']);
    });

    it('checks authentication before validation', async () => {
      const res = await api.post('/api/pantry').send({});

      assert.equal(res.status, 401);
    });
  });

  describe('auth input', () => {
    it('trims and lowercases the email as part of validation', async () => {
      const res = await api
        .post('/api/auth/register')
        .send({ email: '  Mixed@Example.COM ', password: PASSWORD });

      assert.equal(res.status, 201);
      assert.equal(res.body.user.email, 'mixed@example.com');
    });

    it('counts bytes, not characters, for the 72-byte password limit', async () => {
      const res = await api
        .post('/api/auth/register')
        .send({ email: 'bytes@example.com', password: '€'.repeat(25) });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Password must be at most 72 bytes');
    });
  });

  describe('messages clients can rely on', () => {
    it('names the recipe id rule', async () => {
      const res = await api.get('/api/recipes/abc');

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Recipe id must be a positive integer');
    });

    it('explains a missing ingredients list', async () => {
      const res = await api.get('/api/recipes/match');

      assert.equal(res.status, 400);
      assert.match(res.body.error, /ingredients is required/);
    });

    it('explains a malformed ingredients list', async () => {
      const res = await api.get('/api/recipes/match?ingredients=abc');

      assert.equal(res.status, 400);
      assert.equal(
        res.body.error,
        'ingredients must be a comma-separated list of positive integers'
      );
    });

    it('explains an ingredients list that is too long', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => i + 1).join(',');
      const res = await api.get(`/api/recipes/match?ingredients=${ids}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Too many ingredients (maximum 50)');
    });

    it('explains a bad maxMissing and names the field', async () => {
      const res = await api.get('/api/recipes/match?ingredients=1&maxMissing=-1');

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'maxMissing must be a non-negative integer');
      assert.equal(res.body.details[0].field, 'maxMissing');
    });

    it('explains a bad pantry body and names the field', async () => {
      const res = await api
        .post('/api/pantry')
        .set(bearer(session.token))
        .send({ ingredientId: '1' });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'ingredientId must be a positive integer');
      assert.equal(res.body.details[0].field, 'ingredientId');
    });
  });
});