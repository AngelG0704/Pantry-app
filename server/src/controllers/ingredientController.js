import * as ingredientService from '../services/ingredientService.js';

export async function getIngredients(req, res, next) {
  try {
    const ingredients = await ingredientService.listIngredients();
    res.json(ingredients);
  } catch (err) {
    next(err);
  }
}