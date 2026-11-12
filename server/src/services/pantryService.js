import pool from '../db/pool.js';

// The fields of a pantry item, shared by the list and PATCH so they can't drift apart.
// DATE -> text so it never shifts a day; NUMERIC -> float8 so it arrives as a number, not a string.
const ITEM_COLUMNS = `i.id, i.name,
       to_char(p.expires_on, 'YYYY-MM-DD') AS "expiresOn",
       p.quantity::float8 AS quantity,
       p.unit,
       p.added_at AS "addedAt"`;

export async function listPantry(userId) {
    const result = await pool.query(
    `SELECT ${ITEM_COLUMNS}
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

    // Return the whole row, new or already there, in the same shape as GET and PATCH.
    const item = await pool.query(
        `SELECT ${ITEM_COLUMNS}
         FROM pantry_items p
         JOIN ingredients i ON i.id = p.ingredient_id
         WHERE p.user_id = $1 AND p.ingredient_id = $2`,
        [userId, ingredientId]
    );

    return { item: item.rows[0], created: inserted.rowCount === 1 };
}

export async function removeFromPantry(userId, ingredientId) {
    const result = await pool.query(
        'DELETE FROM pantry_items WHERE user_id = $1 AND ingredient_id = $2',
        [userId, ingredientId]
    );
    return result.rowCount === 1;
}

// Partial update: only the fields present in `changes` are written.
// `changes` may hold expiresOn, and/or quantity + unit together (validation guarantees the pair).
export async function updatePantryItem(userId, ingredientId, changes) {
    const setExpiry = Object.hasOwn(changes, 'expiresOn');
    const setAmount = Object.hasOwn(changes, 'quantity');

    const result = await pool.query(
        `UPDATE pantry_items p
         SET expires_on = CASE WHEN $3 THEN $4::date    ELSE p.expires_on END,
             quantity   = CASE WHEN $5 THEN $6::numeric ELSE p.quantity END,
             unit       = CASE WHEN $5 THEN $7::text    ELSE p.unit END
         FROM ingredients i
         WHERE p.user_id = $1
           AND p.ingredient_id = $2
           AND i.id = p.ingredient_id
         RETURNING ${ITEM_COLUMNS}`,
        [
            userId,
            ingredientId,
            setExpiry,
            setExpiry ? changes.expiresOn : null,
            setAmount,
            setAmount ? changes.quantity : null,
            setAmount ? changes.unit : null,
        ]
    );
    return result.rows[0] ?? null;
}