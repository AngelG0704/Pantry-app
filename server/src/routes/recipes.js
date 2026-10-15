import { Router } from 'express';
import { getRecipe } from '../controllers/recipeController.js';

const router = Router();

router.get('/:id', getRecipe);

export default router;