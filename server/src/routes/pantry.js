import { Router } from "express";
import {
    getPantry,
    addPantryItem,
    removePantryItem,
} from '../controllers/pantryController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getMatchesForMyPantry } from "../controllers/recipeController.js";

const router = Router();

router.use(requireAuth);

router.get('/', getPantry);
router.get('/matches', getMatchesForMyPantry);
router.post('/', addPantryItem);
router.delete('/:ingredientId', removePantryItem);

export default router;