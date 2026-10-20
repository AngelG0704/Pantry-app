import { Router } from 'express';
import { getRecipe, getRecipeMatches } from '../controllers/recipeController.js';

const router = Router();

router.get('/match', getRecipeMatches);
router.get('/:id', getRecipe);

export default router;