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