import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, ingredientIds, resetDatabase, closeDatabase } from './helpers.js';

describe('GET /api/recipes/match', () => {
  let ids;

  before(async () => {
    await resetDatabase();
    ids = await ingredientIds();
  });
  after(closeDatabase);

  const eggAndButter = () => `ingredients=${ids.egg},${ids.butter}`;

  it('ranks recipes by score, then matches, then title', async () => {
    const res = await api.get(`/api/recipes/match?${eggAndButter()}`);

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((recipe) => recipe.title),
      ['Scrambled eggs', 'Cheese omelette', 'Grilled cheese']
    );
    assert.deepEqual(
      res.body.map((recipe) => recipe.matchScore),
      [1, 0.67, 0.33]
    );
  });

  it('lists the missing ingredients of each recipe, alphabetically', async () => {
    const res = await api.get(`/api/recipes/match?${eggAndButter()}`);

    assert.deepEqual(
      res.body.map((recipe) => recipe.missingIngredients),
      [[], ['cheese'], ['bread', 'cheese']]
    );
  });

  it('returns numbers, not strings, for counts and scores', async () => {
    const res = await api.get(`/api/recipes/match?${eggAndButter()}`);

    for (const recipe of res.body) {
      assert.equal(typeof recipe.matchedCount, 'number');
      assert.equal(typeof recipe.totalCount, 'number');
      assert.equal(typeof recipe.matchScore, 'number');
    }
  });

  it('keeps totalCount - matchedCount equal to the number of missing ingredients', async () => {
    const res = await api.get(`/api/recipes/match?${eggAndButter()}`);

    for (const recipe of res.body) {
      assert.equal(
        recipe.totalCount - recipe.matchedCount,
        recipe.missingIngredients.length
      );
    }
  });

  it('leaves out recipes that share no ingredient with the request', async () => {
    const res = await api.get(`/api/recipes/match?${eggAndButter()}`);

    const titles = res.body.map((recipe) => recipe.title);
    assert.equal(titles.includes('Tomato toast'), false);
  });

  it('with maxMissing=0 returns only recipes you can make now', async () => {
    const res = await api.get(`/api/recipes/match?${eggAndButter()}&maxMissing=0`);

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((recipe) => recipe.title),
      ['Scrambled eggs']
    );
  });

  it('with maxMissing=1 returns recipes missing at most one ingredient', async () => {
    const res = await api.get(`/api/recipes/match?${eggAndButter()}&maxMissing=1`);

    assert.deepEqual(
      res.body.map((recipe) => recipe.title),
      ['Scrambled eggs', 'Cheese omelette']
    );
  });

  it('treats duplicate ids as one', async () => {
    const plain = await api.get(`/api/recipes/match?${eggAndButter()}`);
    const duplicated = await api.get(
      `/api/recipes/match?ingredients=${ids.egg},${ids.egg},${ids.butter}`
    );

    assert.equal(duplicated.status, 200);
    assert.deepEqual(duplicated.body, plain.body);
  });

  it('returns 200 and an empty list when nothing matches', async () => {
    const res = await api.get('/api/recipes/match?ingredients=99999');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  const badQueries = [
    ['a missing ingredients parameter', ''],
    ['an empty ingredients parameter', '?ingredients='],
    ['non-numeric ids', '?ingredients=abc'],
    ['an empty item in the list', '?ingredients=1,,2'],
    [
      'more than 50 ids',
      `?ingredients=${Array.from({ length: 51 }, (_, i) => i + 1).join(',')}`,
    ],
    ['an id too large for the database', '?ingredients=99999999999'],
    ['a repeated ingredients parameter', '?ingredients=1&ingredients=2'],
    ['a negative maxMissing', '?ingredients=1&maxMissing=-1'],
    ['a decimal maxMissing', '?ingredients=1&maxMissing=1.5'],
    ['an empty maxMissing', '?ingredients=1&maxMissing='],
    ['a repeated maxMissing', '?ingredients=1&maxMissing=1&maxMissing=2'],
  ];

  for (const [name, query] of badQueries) {
    it(`returns 400 for ${name}`, async () => {
      const res = await api.get(`/api/recipes/match${query}`);

      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  }
});