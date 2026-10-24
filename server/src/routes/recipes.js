import { Router } from 'express';
import { getRecipe, getRecipeMatches } from '../controllers/recipeController.js';
import { validate } from '../middleware/validate.js';
import { idParam, matchQuery } from '../validation/schemas.js';

const router = Router();

router.get('/match', validate({ query: matchQuery }), getRecipeMatches);
router.get('/:id', validate({ params: idParam('id', 'Recipe id') }), getRecipe);

export default router;