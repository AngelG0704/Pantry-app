import { readFile } from 'node:fs/promises';
import pool from './pool.js';
import { recipes } from './seedData.js';

async function seed() {
    const client = await pool.connect();

    try{
        await client.query('BEGIN');

        const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
        await client.query(schema);

        const names = [...new Set(recipes.flatMap((r) => r.ingredients))];
        for (const name of names) {
            await client.query(
                'INSERT INTO ingredients (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', 
                [name]
            );
        }

        for (const recipe of recipes) {
            const { rows } = await client.query(
                `INSERT INTO recipes (title, instructions, prep_minutes)
                VALUES ($1, $2, $3)
                ON CONFLICT (title) DO UPDATE
                SET instructions = EXCLUDED.instructions,
                prep_minutes = EXCLUDED.prep_minutes
                RETURNING id`,
                [recipe.title, recipe.instructions, recipe.prepMinutes]
            );
            const recipeId = rows[0].id;

            await client.query(
                'DELETE FROM recipe_ingredients WHERE recipe_id = $1',
                [recipeId]
            );
            await client.query(
                `INSERT INTO recipe_ingredients (recipe_id, ingredient_id)
                SELECT $1::int, id FROM ingredients WHERE name = ANY($2::text[])`,
                [recipeId, recipe.ingredients]
            );
        }

        await client.query('COMMIT');
        console.log();
        console.log(`Seeded ${recipes.length} recipes and ${names.length} ingredients.`);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
        client.release();
    }
}

try {
    await seed();
} catch (err) {
    console.error('Seed failed', err.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}