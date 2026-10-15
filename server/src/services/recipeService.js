import pool from '../db/pool.js';

export async function getRecipeById(id) {
    const result = await pool.query(
        `SELECT r.id, r.title, r.instructions, r.prep_minutes, i.name AS ingredient
        FROM recipes r
        JOIN recipe_ingredients ri ON ri.recipe_id = r.id
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE r.id = $1
        ORDER BY i.name`,
        [id]
    );

    if (result.rows.length === 0){
        return null;
    }

    const { id: recipeId, title, instructions, prep_minutes } = result.rows[0];

    return {
        id: recipeId,
        title,
        instructions,
        prepminutes: prep_minutes,
        ingredients: result.rows.map((row) => row.ingredient),
    };
}