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
import { UNITS } from '../src/validation/schemas.js';

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

  const setExpiry = (session, ingredientId, body) =>
    api
      .patch(`/api/pantry/${ingredientId}`)
      .set(bearer(session.token))
      .send(body);

  const expiryOf = async (session, ingredientId) =>
    (await listPantry(session)).body.find((item) => item.id === ingredientId)
      ?.expiresOn;
  
  const patchItem = (session, ingredientId, body) =>
    api
      .patch(`/api/pantry/${ingredientId}`)
      .set(bearer(session.token))
      .send(body);

  const itemOf = async (session, ingredientId) =>
    (await listPantry(session)).body.find((item) => item.id === ingredientId);

  const names = (res) => res.body.map((item) => item.name);

  
  // A TIMESTAMPTZ is a moment, not a calendar day, so it travels as a full ISO string in UTC.
  const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  // addedAt is "now", so a test can't spell out its value. Check its format here,
  // then hand back the rest of the item for an exact deepEqual.
  const withoutAddedAt = (item) => {
    assert.match(item.addedAt, ISO_UTC);
    const { addedAt: _addedAt, ...rest } = item;
    return rest;
  };

  describe('authentication', () => {
    const protectedRoutes = [
      ['GET', '/api/pantry'],
      ['POST', '/api/pantry'],
      ['DELETE', '/api/pantry/1'],
      ['GET', '/api/pantry/matches'],
      ['DELETE', '/api/pantry/1'],
      ['PATCH','/api/pantry/1'],
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
      assert.deepEqual(res.body.map(withoutAddedAt), [
        { id: ids.butter, name: 'butter', expiresOn: null, quantity: null, unit: null },
        { id: ids.egg, name: 'egg', expiresOn: null, quantity: null, unit: null },
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

  describe('PATCH /api/pantry/:ingredientId', () => {
    it('sets a date, returns the updated item, and the list shows it', async () => {
      await addToPantry(alice, ids.egg);

      const res = await setExpiry(alice, ids.egg, { expiresOn: '2026-11-10' });

      assert.equal(res.status, 200);
      assert.deepEqual(withoutAddedAt(res.body), {
        id: ids.egg,
        name: 'egg',
        expiresOn: '2026-11-10',
        quantity: null,
        unit: null,
      });      
      assert.equal(await expiryOf(alice, ids.egg), '2026-11-10');
    });

    it('clears the date with null', async () => {
      await addToPantry(alice, ids.egg);
      await setExpiry(alice, ids.egg, { expiresOn: '2026-11-10' });

      const res = await setExpiry(alice, ids.egg, { expiresOn: null });

      assert.equal(res.status, 200);
      assert.equal(res.body.expiresOn, null);
      assert.equal(await expiryOf(alice, ids.egg), null);
    });

    it('replaces an existing date', async () => {
      await addToPantry(alice, ids.egg);
      await setExpiry(alice, ids.egg, { expiresOn: '2026-11-10' });
      await setExpiry(alice, ids.egg, { expiresOn: '2026-12-01' });

      assert.equal(await expiryOf(alice, ids.egg), '2026-12-01');
    });

    // Catches the node-postgres DATE -> local-midnight Date -> UTC shift.
    for (const date of ['2026-01-01', '2024-02-29', '2026-12-31']) {
      it(`returns ${date} exactly, with no time or day shift`, async () => {
        await addToPantry(alice, ids.egg);

        const res = await setExpiry(alice, ids.egg, { expiresOn: date });

        assert.equal(res.body.expiresOn, date);
        assert.equal(await expiryOf(alice, ids.egg), date);
      });
    }

    it('accepts a date in the past', async () => {
      await addToPantry(alice, ids.egg);

      const res = await setExpiry(alice, ids.egg, { expiresOn: '2020-05-01' });

      assert.equal(res.status, 200);
      assert.equal(res.body.expiresOn, '2020-05-01');
    });

    it('changes only the item it names', async () => {
      await addToPantry(alice, ids.egg);
      await addToPantry(alice, ids.butter);

      await setExpiry(alice, ids.egg, { expiresOn: '2026-11-10' });

      assert.equal(await expiryOf(alice, ids.butter), null);
    });

    it('starts without a date after the item is removed and added again', async () => {
      await addToPantry(alice, ids.egg);
      await setExpiry(alice, ids.egg, { expiresOn: '2026-11-10' });
      await api.delete(`/api/pantry/${ids.egg}`).set(bearer(alice.token));
      await addToPantry(alice, ids.egg);

      assert.equal(await expiryOf(alice, ids.egg), null);
    });

    it('returns 404 for an ingredient that is not in the pantry', async () => {
      const res = await setExpiry(alice, ids.egg, { expiresOn: '2026-11-10' });

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Ingredient not in pantry');
    });

    it('returns 404 for an id too large to exist', async () => {
      const res = await setExpiry(alice, '99999999999', { expiresOn: '2026-11-10' });

      assert.equal(res.status, 404);
    });

    it('returns 400 for an id that is not a number', async () => {
      const res = await setExpiry(alice, 'abc', { expiresOn: '2026-11-10' });

      assert.equal(res.status, 400);
    });

    const invalidBodies = [
      ['an impossible date', { expiresOn: '2026-02-30' }],
      ['a US-style date', { expiresOn: '11/04/2026' }],
      ['an empty string', { expiresOn: '' }],
      ['a number', { expiresOn: 20261110 }],
      ['an empty body', {}],
      ['an unknown key', { expiresOn: null, color: 'red' }],    ];

    for (const [name, body] of invalidBodies) {
      it(`rejects ${name} with 400 and changes nothing`, async () => {
        await addToPantry(alice, ids.egg);
        await setExpiry(alice, ids.egg, { expiresOn: '2026-11-10' });

        const res = await setExpiry(alice, ids.egg, body);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
        assert.equal(await expiryOf(alice, ids.egg), '2026-11-10');
      });
    }
  });

  describe('PATCH /api/pantry/:ingredientId (quantity and unit)', () => {
    it('sets an amount, returns it as a number, and the list shows it', async () => {
      await addToPantry(alice, ids.egg);

      const res = await patchItem(alice, ids.egg, { quantity: 6, unit: 'piece' });

      assert.equal(res.status, 200);
      assert.deepEqual(withoutAddedAt(res.body), {
        id: ids.egg,
        name: 'egg',
        expiresOn: null,
        quantity: 6,
        unit: 'piece',
      });
      const listed = await itemOf(alice, ids.egg);
      assert.equal(listed.quantity, 6);
      assert.equal(typeof listed.quantity, 'number');
      assert.equal(listed.unit, 'piece');
    });

    // NUMERIC comes back from node-postgres as a string ("1.500") unless converted.
    for (const quantity of [1.5, 0.25, 0.001, 1.005, 9999999.999]) {
      it(`returns ${quantity} exactly, as a number`, async () => {
        await addToPantry(alice, ids.egg);

        const res = await patchItem(alice, ids.egg, { quantity, unit: 'g' });

        assert.strictEqual(res.body.quantity, quantity);
        assert.strictEqual((await itemOf(alice, ids.egg)).quantity, quantity);
      });
    }

    it('clears the amount when both are null', async () => {
      await addToPantry(alice, ids.egg);
      await patchItem(alice, ids.egg, { quantity: 2, unit: 'cup' });

      const res = await patchItem(alice, ids.egg, { quantity: null, unit: null });

      assert.equal(res.status, 200);
      assert.equal(res.body.quantity, null);
      assert.equal(res.body.unit, null);
    });

    it('keeps the date when only the amount is sent', async () => {
      await addToPantry(alice, ids.egg);
      await patchItem(alice, ids.egg, { expiresOn: '2026-11-10' });

      await patchItem(alice, ids.egg, { quantity: 2, unit: 'cup' });

      assert.equal((await itemOf(alice, ids.egg)).expiresOn, '2026-11-10');
    });

    it('keeps the amount when only the date is sent (or cleared)', async () => {
      await addToPantry(alice, ids.egg);
      await patchItem(alice, ids.egg, { quantity: 2, unit: 'cup' });

      await patchItem(alice, ids.egg, { expiresOn: '2026-11-10' });
      await patchItem(alice, ids.egg, { expiresOn: null });

      const item = await itemOf(alice, ids.egg);
      assert.equal(item.quantity, 2);
      assert.equal(item.unit, 'cup');
    });

    it('sets the date and the amount in one request', async () => {
      await addToPantry(alice, ids.egg);

      const res = await patchItem(alice, ids.egg, {
        expiresOn: '2026-12-01',
        quantity: 0.5,
        unit: 'kg',
      });

      assert.equal(res.status, 200);
      assert.deepEqual(withoutAddedAt(await itemOf(alice, ids.egg)), {        
        id: ids.egg,
        name: 'egg',
        expiresOn: '2026-12-01',
        quantity: 0.5,
        unit: 'kg',
      });
    });

    // The unit list lives in zod and in migration 003; if they disagree, this hits the
    // database CHECK and fails with 500 instead of 200.
    for (const unit of UNITS) {
      it(`accepts the unit "${unit}" all the way into the database`, async () => {
        await addToPantry(alice, ids.egg);

        const res = await patchItem(alice, ids.egg, { quantity: 1, unit });

        assert.equal(res.status, 200);
        assert.equal(res.body.unit, unit);
      });
    }

    it('starts with no amount, and again after the item is removed and re-added', async () => {
      await addToPantry(alice, ids.egg);
      assert.equal((await itemOf(alice, ids.egg)).quantity, null);

      await patchItem(alice, ids.egg, { quantity: 2, unit: 'cup' });
      await api.delete(`/api/pantry/${ids.egg}`).set(bearer(alice.token));
      await addToPantry(alice, ids.egg);

      const item = await itemOf(alice, ids.egg);
      assert.equal(item.quantity, null);
      assert.equal(item.unit, null);
    });

    it('returns 404 for an ingredient that is not in the pantry', async () => {
      const res = await patchItem(alice, ids.egg, { quantity: 2, unit: 'cup' });

      assert.equal(res.status, 404);
    });

    it('explains that quantity and unit go together', async () => {
      await addToPantry(alice, ids.egg);

      const res = await patchItem(alice, ids.egg, { quantity: 2 });

      assert.equal(res.status, 400);
      assert.equal(
        res.body.error,
        'quantity and unit must be sent together, both set or both null'
      );
    });

    const invalidBodies = [
      ['a quantity without a unit', { quantity: 2 }],
      ['a unit without a quantity', { unit: 'cup' }],
      ['a null quantity with a unit', { quantity: null, unit: 'cup' }],
      ['a quantity with a null unit', { quantity: 2, unit: null }],
      ['a quantity of zero', { quantity: 0, unit: 'cup' }],
      ['a negative quantity', { quantity: -1, unit: 'cup' }],
      ['more than 3 decimal places', { quantity: 1.2345, unit: 'cup' }],
      ['a quantity sent as a string', { quantity: '2', unit: 'cup' }],
      ['a quantity too large for the column', { quantity: 10000000, unit: 'g' }],
      ['a unit in the wrong case', { quantity: 2, unit: 'Cup' }],
      ['an unknown unit', { quantity: 2, unit: 'pinch' }],
      ['a valid date with an invalid amount', { expiresOn: '2026-12-01', quantity: 0, unit: 'cup' }],
    ];

    for (const [name, body] of invalidBodies) {
      it(`rejects ${name} with 400 and changes nothing`, async () => {
        await addToPantry(alice, ids.egg);
        await patchItem(alice, ids.egg, { expiresOn: '2026-11-10', quantity: 2, unit: 'cup' });
        const before = await itemOf(alice, ids.egg);

        const res = await patchItem(alice, ids.egg, body);

        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
        assert.deepEqual(await itemOf(alice, ids.egg), before);
      });
    }
  });

  describe('addedAt', () => {
    // Tests pin added_at directly so they never depend on the clock.
    const setAddedAt = (session, ingredientId, moment) =>
      pool.query(
        'UPDATE pantry_items SET added_at = $3 WHERE user_id = $1 AND ingredient_id = $2',
        [session.user.id, ingredientId, moment]
      );

    it('lists addedAt as an ISO timestamp string from just now', async () => {
      const startedAt = Date.now();
      await addToPantry(alice, ids.egg);

      const { addedAt } = await itemOf(alice, ids.egg);

      assert.equal(typeof addedAt, 'string');
      assert.match(addedAt, ISO_UTC);
      const ms = Date.parse(addedAt);
      assert.ok(ms >= startedAt - 5000 && ms <= Date.now() + 5000, `addedAt ${addedAt} is not recent`);
    });

    it('returns the stored moment exactly, converted to UTC', async () => {
      await addToPantry(alice, ids.egg);
      // 8:30 pm in New York is already the next day in UTC.
      await setAddedAt(alice, ids.egg, '2026-11-08 20:30:00-05');

      assert.equal((await itemOf(alice, ids.egg)).addedAt, '2026-11-09T01:30:00.000Z');
    });

    it('PATCH returns addedAt and does not change it', async () => {
      await addToPantry(alice, ids.egg);
      await setAddedAt(alice, ids.egg, '2026-01-01T00:00:00Z');

      const res = await patchItem(alice, ids.egg, { expiresOn: '2026-11-10', quantity: 6, unit: 'piece' });

      assert.equal(res.status, 200);
      assert.equal(res.body.addedAt, '2026-01-01T00:00:00.000Z');
      assert.equal((await itemOf(alice, ids.egg)).addedAt, '2026-01-01T00:00:00.000Z');
    });

    it('adding the same ingredient again keeps the first addedAt', async () => {
      await addToPantry(alice, ids.egg);
      await setAddedAt(alice, ids.egg, '2026-01-01T00:00:00Z');

      await addToPantry(alice, ids.egg);

      assert.equal((await itemOf(alice, ids.egg)).addedAt, '2026-01-01T00:00:00.000Z');
    });

    it('removing and adding again gives a new addedAt', async () => {
      await addToPantry(alice, ids.egg);
      await setAddedAt(alice, ids.egg, '2026-01-01T00:00:00Z');

      await api.delete(`/api/pantry/${ids.egg}`).set(bearer(alice.token));
      await addToPantry(alice, ids.egg);

      const { addedAt } = await itemOf(alice, ids.egg);
      assert.match(addedAt, ISO_UTC);
      assert.notEqual(addedAt, '2026-01-01T00:00:00.000Z');
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

    it("does not let one user set the date on another user's item", async () => {
      await addToPantry(alice, ids.egg);

      const res = await setExpiry(bob, ids.egg, { expiresOn: '2026-11-10' });

      assert.equal(res.status, 404);
      assert.equal(await expiryOf(alice, ids.egg), null);
    });

    it("does not let one user set the amount on another user's item", async () => {
      await addToPantry(alice, ids.egg);

      const res = await patchItem(bob, ids.egg, { quantity: 2, unit: 'cup' });

      assert.equal(res.status, 404);
      assert.equal((await itemOf(alice, ids.egg)).quantity, null);
    });

    it('keeps separate dates when two users have the same ingredient', async () => {
      await addToPantry(alice, ids.egg);
      await addToPantry(bob, ids.egg);

      await setExpiry(alice, ids.egg, { expiresOn: '2026-11-10' });
      await setExpiry(bob, ids.egg, { expiresOn: '2026-12-01' });

      assert.equal(await expiryOf(alice, ids.egg), '2026-11-10');
      assert.equal(await expiryOf(bob, ids.egg), '2026-12-01');
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