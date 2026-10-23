import { describe, it, before, after } from 'node:test';
import assert  from 'node:assert/strict';  
import { api, resetDatabase, closeDatabase } from './helpers.js';

describe('catalog (public read endpoints)', () => {
  before(resetDatabase);
  after(closeDatabase);

  describe('GET /api/ingredients', () => {
    it('lists every ingredient, sorted by name', async () => {
      const res = await api.get('/api/ingredients');

      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((ingredient) => ingredient.name),
        ['bread', 'butter', 'cheese', 'egg', 'tomato']
      );
    });
  });

  describe('GET /api/recipes/:id', () => {
    it('returns a recipe with its sorted ingredient names', async () => {
      const res = await api.get('/api/recipes/2');

      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Grilled cheese');
      assert.deepEqual(res.body.ingredients, ['bread', 'butter', 'cheese']);
    });

    it('returns 404 for a recipe that does not exist', async () => {
      const res = await api.get('/api/recipes/999');

      assert.equal(res.status, 404);
    });

    it('returns 400 for an id that is not a number', async () => {
      const res = await api.get('/api/recipes/abc');

      assert.equal(res.status, 400);
    });

    it('returns 404 for an id too large to exist', async () => {
      const res = await api.get('/api/recipes/99999999999');

      assert.equal(res.status, 404);
    });
  });

  describe('unknown routes', () => {
    it('returns a JSON 404', async () => {
      const res = await api.get('/api/nothing');

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Route not found');
    });
  });
});