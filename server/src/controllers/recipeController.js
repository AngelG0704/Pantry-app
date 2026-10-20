import * as recipeService from '../services/recipeService.js';

const MAX_INT = 2147483647;

export async function getRecipe(req, res, next) {
    try{
        if (!/^\d+$/.test(req.params.id)) {
            return res.status(400).json({ error: 'Recipe id must be a positive integer' });
        }

        const id = Number(req.params.id);

        if (id > MAX_INT) {
            return res.status(404).json({ error: 'Recipe not found' });
        }

        const recipe = await recipeService.getRecipeById(id);

        if (!recipe) {
            return res.status(404).json({ error: 'Recipe not found' });
        }

        res.json(recipe);
    } catch (err){
        next(err);
    }
}

const MAX_MATCH_IDS = 50;

export async function getRecipeMatches(req, res, next) {
    try{
        const raw = req.query.ingredients;

        if (typeof raw !== 'string' || raw === '') {
            return res.status(400).json({
                error: 'Query parameter "ingredients" is required, e.g. ?ingredients=1,2,3',
            });
        }

        const parts = raw.split(',');
        if (!parts.every((part) => /^\d+$/.test(part))) {
            return res.status(400).json({
                error: 'ingredients must be a comma-seperated list of positive integers',
            });
        }

        const ids = [...new Set(parts.map(Number))];

        if (ids.length > MAX_MATCH_IDS){
            return res.status(400).json({
                error: `Too many ingredients (maximum ${MAX_MATCH_IDS})`,
            });
        }
        if (ids.some((id) => id > MAX_INT)) {
            return res.status(400).json({ error: 'Ingredient id out of range' });
        }

        const matches = await recipeService.matchRecipes(ids);
        res.json(matches);
    } catch (err) {
        next(err);
    }
}