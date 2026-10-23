import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import request from 'supertest';
import pool from '../src/db/pool.js';
import app from '../src/app.js';
import { log } from 'node:console';

const databaseName = new URL(process.env.DATABASE_URL).pathname.slice(1);

if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests: database "${databaseName}" does not end with "_test". ` +
      'Run the tests with "npm test", which loads .env.test.'
  );
}

export const api = request(app);

export const PASSWORD = 'correct horse battery';


export const fixtures = {
    ingredients: ['egg', 'butter', 'bread', 'cheese', 'tomato'],
      recipes: [
    {
      title: 'Scrambled eggs',
      instructions: 'Whisk the eggs and cook in butter.',
      prepMinutes: 5,
      ingredients: ['egg', 'butter'],
    },
    {
      title: 'Grilled cheese',
      instructions: 'Butter the bread, add cheese, and toast.',
      prepMinutes: 10,
      ingredients: ['bread', 'butter', 'cheese'],
    },
    {
      title: 'Cheese omelette',
      instructions: 'Beat the eggs, cook in butter, and add cheese.',
      prepMinutes: 10,
      ingredients: ['egg', 'cheese', 'butter'],
    },
    {
      title: 'Tomato toast',
      instructions: 'Toast the bread and top with tomato.',
      prepMinutes: 5,
      ingredients: ['bread', 'tomato'],
    },
  ],
};

export async function resetDatabase() {
    const schema = await readFile(
        new URL('../src/db/schema.sql', import.meta.url),
        'utf8'
    );
    await pool.query(schema);

    await pool.query(
        `TRUNCATE pantry_items, recipe_ingredients, recipes, ingredients, users
     RESTART IDENTITY CASCADE`
    );

    for (const name of fixtures.ingredients) {
        await pool.query('INSERT INTO ingredients (name) VALUES ($1)', [name]);
    }

    for (const recipe of fixtures.recipes) {
        const { rows } = await pool.query(
            `INSERT INTO recipes (title, instructions, prep_minutes)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [recipe.title, recipe.instructions, recipe.prepMinutes]
        );

        await pool.query(
            `INSERT INTO recipe_ingredients (recipe_id, ingredient_id)
            SELECT $1::int, id FROM ingredients WHERE name = ANY($2::text[])`,
            [rows[0].id, recipe.ingredients]
        );
    }
}

export function bearer(token){
  return { Authorization: `Bearer ${token}` };
}

export async function createUserAndToken(email) {
  const registered = await api
  .post('/api/auth/register')
  .send({ email, password: PASSWORD });

  const login = await api
    .post('/api/auth/login')
    .send({ email, password:PASSWORD });
  assert.equal(login.status, 200, `could not log in ${email}`);

  return { user: registered.body.user, token: login.body.token };
}

export async function ingredientIds() {
  const { rows } = await pool.query(`SELECT id, name FROM ingredients`);
  return Object.fromEntries(rows.map((row) => [row.name, row.id]));
}


export async function closeDatabase() {
    await pool.end();
}