import { Router } from 'express';
import { getIngredients } from '../controllers/ingredientController.js';

const router = Router();

router.get('/', getIngredients);

export default router;