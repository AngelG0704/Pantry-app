import * as recipeService from '../services/recipeService.js';
import { MAX_INT } from '../constants.js';


export async function getRecipe(req, res, next) {
    try{
        const { id } = req.valid.params;

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


export async function getRecipeMatches(req, res, next) {
    try{
        const { ingredients, maxMissing } = req.valid.query;

        const matches = await recipeService.matchRecipes(ingredients, {
            maxMissing: maxMissing ?? null,
        });
        res.json(matches);
    } catch (err){
        next(err);
    }
}

export async function getMatchesForMyPantry(req, res, next) {
    try {
        const { maxMissing } = req.valid.query;

        const matches = await recipeService.matchRecipesForUser(req.user.id, {
            maxMissing: maxMissing ?? null,
        });
        res.json(matches);
    } catch (err) {
        next(err);
    }
}