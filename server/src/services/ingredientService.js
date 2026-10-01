import pool from '../db/pool.js';

export async function listIngredients(){
    const result = await pool.query(
        'SELECT id, name FROM ingredients ORDER BY name'
    );
    return result.rows;
}