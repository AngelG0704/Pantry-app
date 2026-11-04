import pool from '../db/pool.js';

export async function listPantry(userId) {
    const result = await pool.query(
    `SELECT i.id, i.name,
            to_char(p.expires_on, 'YYYY-MM-DD') AS "expiresOn"
     FROM pantry_items p
     JOIN ingredients i ON i.id = p.ingredient_id
     WHERE p.user_id = $1
     ORDER BY i.name`,
     [userId]
    );
    return result.rows;
}

export async function addToPantry(userId, ingredientId) {
    const found = await pool.query(
        'SELECT id, name FROM ingredients WHERE id = $1',
        [ingredientId]
    );
    if (found.rows.length === 0){
        return null;
    }

    const inserted = await pool.query(
        `INSERT INTO pantry_items (user_id, ingredient_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, ingredient_id) DO NOTHING`,
        [userId, ingredientId]
    );

    return { ingredient: found.rows[0], created: inserted.rowCount === 1 };
}

export async function removeFromPantry(userId, ingredientId) {
    const result = await pool.query(
        'DELETE FROM pantry_items WHERE user_id = $1 AND ingredient_id = $2',
        [userId, ingredientId]
    );
    return result.rowCount === 1;
}

export async function setPantryExpiry(userId, ingredientId, expiresOn) {
    const result = await pool.query(
        `UPDATE pantry_items p
         SET expires_on = $3::date
         FROM ingredients i
         WHERE p.user_id = $1
           AND p.ingredient_id = $2
           AND i.id = p.ingredient_id
         RETURNING i.id, i.name,
                   to_char(p.expires_on, 'YYYY-MM-DD') AS "expiresOn"`,
        [userId, ingredientId, expiresOn]
    );
    return result.rows[0] ?? null;
}