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



export async function matchRecipes(ingredientIds, { maxMissing = null } = {}) {
    const result = await pool.query(
        `SELECT r.id, r.title, r.prep_minutes,
            COUNT(*)::int AS total_count,
            COUNT(have.ingredient_id)::int AS matched_count,
            ROUND(COUNT(have.ingredient_id)::numeric / COUNT(*), 2)::float AS match_score,
            COALESCE(
              ARRAY_AGG(i.name ORDER BY i.name)
                FILTER (WHERE have.ingredient_id IS NULL),
              '{}'
            ) AS missing_ingredients
     FROM recipes r
     JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     JOIN ingredients i ON i.id = ri.ingredient_id
     LEFT JOIN unnest($1::int[]) AS have(ingredient_id)
       ON have.ingredient_id = ri.ingredient_id
     GROUP BY r.id
     HAVING COUNT(have.ingredient_id) > 0
        AND ($2::int IS NULL
             OR COUNT(*) - COUNT(have.ingredient_id) <= $2::int)
     ORDER BY match_score DESC, matched_count DESC, r.title ASC`,
     [ingredientIds, maxMissing]
    );

    return result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        prepMinutes: row.prep_minutes,
        matchedCount: row.matched_count,
        totalCount: row.total_count,
        matchScore: row.match_score,
        missingIngredients: row.missing_ingredients,
    }));
}