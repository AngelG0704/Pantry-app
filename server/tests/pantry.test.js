import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/db/pool.js';
import {
  api,
  bearer,
  createUserAndToken,
  ingredientIds,
  resetDatabase,
  closeDatabase,
} from './helpers.js';

describe('pantry', () => {
  let ids;
  let alice;
  let bob;

  before(async () => {
    await resetDatabase();
    ids = await ingredientIds();
    alice = await createUserAndToken('alice@example.com');
    bob = await createUserAndToken('bob@example.com');
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE pantry_items');
  });

  after(closeDatabase);

  const addToPantry = (session, ingredientId) =>
    api.post('/api/pantry').set(bearer(session.token)).send({ ingredientId });

  const listPantry = (session) =>
    api.get('/api/pantry').set(bearer(session.token));

  const names = (res) => res.body.map((item) => item.name);

  describe('authentication', () => {
    const protectedRoutes = [
      ['GET', '/api/pantry'],
      ['POST', '/api/pantry'],
      ['DELETE', '/api/pantry/1'],
      ['GET', '/api/pantry/matches'],
    ];

    for (const [method, path] of protectedRoutes) {
      it(`${method} ${path} requires a token`, async () => {
        const res = await api[method.toLowerCase()](path);

        assert.equal(res.status, 401);
      });
    }
  });

  describe('GET /api/pantry', () => {
    it('starts empty', async () => {
      const res = await listPantry(alice);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    it('lists the ingredients sorted by name', async () => {
      await addToPantry(alice, ids.egg);
      await addToPantry(alice, ids.butter);

      const res = await listPantry(alice);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, [
        { id: ids.butter, name: 'butter' },
        { id: ids.egg, name: 'egg' },
      ]);
    });
  });

  describe('POST /api/pantry', () => {
    it('adds an ingredient and returns it with 201', async () => {
      const res = await addToPantry(alice, ids.egg);

      assert.equal(res.status, 201);
      assert.deepEqual(res.body, { id: ids.egg, name: 'egg' });
      assert.deepEqual(names(await listPantry(alice)), ['egg']);
    });

    it('is idempotent: adding twice returns 200 and creates no duplicate', async () => {
      const first = await addToPantry(alice, ids.egg);
      const second = await addToPantry(alice, ids.egg);

      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      assert.deepEqual(names(await listPantry(alice)), ['egg']);
    });

    it('ignores a client-supplied owner and uses the token', async () => {
      const res = await api
        .post('/api/pantry')
        .set(bearer(alice.token))
        .send({ ingredientId: ids.egg, userId: bob.user.id });

      assert.equal(res.status, 201);
      assert.deepEqual(names(await listPantry(alice)), ['egg']);
      assert.deepEqual((await listPantry(bob)).body, []);
    });

    const invalidBodies = [
      ['a missing ingredientId', {}],
      ['an ingredientId given as a string', { ingredientId: '1' }],
      ['a decimal ingredientId', { ingredientId: 1.5 }],
      ['an ingredientId of zero', { ingredientId: 0 }],
      ['a negative ingredientId', { ingredientId: -1 }],
      ['an ingredientId too large for the database', { ingredientId: 99999999999 }],
    ];

    for (const [name, body] of invalidBodies) {
      it(`rejects ${name} with 400`, async () => {
        const res = await api
          .post('/api/pantry')
          .set(bearer(alice.token))
          .send(body);

        assert.equal(res.status, 400);
      });
    }

    it('rejects an ingredient that does not exist and adds nothing', async () => {
      const res = await addToPantry(alice, 99999);

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Unknown ingredient');
      assert.deepEqual((await listPantry(alice)).body, []);
    });
  });

  describe('DELETE /api/pantry/:ingredientId', () => {
    it('removes an ingredient with 204 and no body', async () => {
      await addToPantry(alice, ids.egg);

      const res = await api
        .delete(`/api/pantry/${ids.egg}`)
        .set(bearer(alice.token));

      assert.equal(res.status, 204);
      assert.equal(res.text, '');
      assert.deepEqual((await listPantry(alice)).body, []);
    });

    it('returns 404 the second time (already gone)', async () => {
      await addToPantry(alice, ids.egg);
      await api.delete(`/api/pantry/${ids.egg}`).set(bearer(alice.token));

      const res = await api
        .delete(`/api/pantry/${ids.egg}`)
        .set(bearer(alice.token));

      assert.equal(res.status, 404);
    });

    it('returns 404 for an ingredient that was never in the pantry', async () => {
      const res = await api
        .delete(`/api/pantry/${ids.egg}`)
        .set(bearer(alice.token));

      assert.equal(res.status, 404);
    });

    it('returns 400 for an id that is not a number', async () => {
      const res = await api.delete('/api/pantry/abc').set(bearer(alice.token));

      assert.equal(res.status, 400);
    });

    it('returns 404 for an id too large to exist', async () => {
      const res = await api
        .delete('/api/pantry/99999999999')
        .set(bearer(alice.token));

      assert.equal(res.status, 404);
    });
  });

  describe('ownership', () => {
    it('shows each user only their own pantry', async () => {
      await addToPantry(alice, ids.egg);
      await addToPantry(alice, ids.butter);
      await addToPantry(bob, ids.cheese);

      assert.deepEqual(names(await listPantry(alice)), ['butter', 'egg']);
      assert.deepEqual(names(await listPantry(bob)), ['cheese']);
    });

    it("does not let one user remove another user's item", async () => {
      await addToPantry(alice, ids.egg);

      const res = await api
        .delete(`/api/pantry/${ids.egg}`)
        .set(bearer(bob.token));

      assert.equal(res.status, 404);
      assert.deepEqual(names(await listPantry(alice)), ['egg']);
    });

    it("leaves other users' copies alone when someone removes the same ingredient", async () => {
      await addToPantry(alice, ids.egg);
      await addToPantry(bob, ids.egg);

      const res = await api
        .delete(`/api/pantry/${ids.egg}`)
        .set(bearer(alice.token));

      assert.equal(res.status, 204);
      assert.deepEqual((await listPantry(alice)).body, []);
      assert.deepEqual(names(await listPantry(bob)), ['egg']);
    });

    it('deletes pantry rows when the account is deleted (cascade)', async () => {
      const temp = await createUserAndToken('temp@example.com');
      await addToPantry(temp, ids.egg);

      const countRows = async () => {
        const { rows } = await pool.query(
          'SELECT COUNT(*)::int AS n FROM pantry_items WHERE user_id = $1',
          [temp.user.id]
        );
        return rows[0].n;
      };

      assert.equal(await countRows(), 1);
      await pool.query('DELETE FROM users WHERE id = $1', [temp.user.id]);
      assert.equal(await countRows(), 0);
    });
  });

  describe('GET /api/pantry/matches', () => {
    it('returns an empty list for an empty pantry', async () => {
      const res = await api
        .get('/api/pantry/matches')
        .set(bearer(alice.token));

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    it('returns exactly what the public endpoint returns for the same ingredients', async () => {
      await addToPantry(alice, ids.egg);
      await addToPantry(alice, ids.butter);

      const mine = await api
        .get('/api/pantry/matches')
        .set(bearer(alice.token));
      const publicResult = await api.get(
        `/api/recipes/match?ingredients=${ids.egg},${ids.butter}`
      );

      assert.equal(mine.status, 200);
      assert.equal(mine.body.length, 3);
      assert.deepEqual(mine.body, publicResult.body);
    });

    it('honors maxMissing', async () => {
      await addToPantry(alice, ids.egg);
      await addToPantry(alice, ids.butter);

      const res = await api
        .get('/api/pantry/matches?maxMissing=1')
        .set(bearer(alice.token));

      assert.deepEqual(
        res.body.map((recipe) => recipe.title),
        ['Scrambled eggs', 'Cheese omelette']
      );
    });

    for (const bad of ['-1', 'abc']) {
      it(`rejects maxMissing=${bad} with 400`, async () => {
        const res = await api
          .get(`/api/pantry/matches?maxMissing=${bad}`)
          .set(bearer(alice.token));

        assert.equal(res.status, 400);
      });
    }

    it("uses only the caller's own pantry", async () => {
      await addToPantry(alice, ids.egg);
      await addToPantry(alice, ids.butter);

      const mine = await api
        .get('/api/pantry/matches')
        .set(bearer(alice.token));
      const others = await api
        .get('/api/pantry/matches')
        .set(bearer(bob.token));

      assert.equal(mine.body.length, 3);
      assert.deepEqual(others.body, []);
    });

    it('reflects changes to the pantry immediately', async () => {
      await addToPantry(alice, ids.egg);
      const before = await api
        .get('/api/pantry/matches')
        .set(bearer(alice.token));

      await addToPantry(alice, ids.butter);
      const after = await api
        .get('/api/pantry/matches')
        .set(bearer(alice.token));

      assert.equal(before.body[0].title, 'Scrambled eggs');
      assert.equal(before.body[0].matchScore, 0.5);
      assert.equal(after.body[0].title, 'Scrambled eggs');
      assert.equal(after.body[0].matchScore, 1);
    });
  });
});