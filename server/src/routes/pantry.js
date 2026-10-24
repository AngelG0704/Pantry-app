import { Router } from "express";
import {
    getPantry,
    addPantryItem,
    removePantryItem,
} from '../controllers/pantryController.js';
import { getMatchesForMyPantry } from "../controllers/recipeController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import {
    addPantryBody,
    idParam,
    pantryMatchQuery,
} from '../validation/schemas.js';

const router = Router();

router.use(requireAuth);

router.get('/', getPantry);
router.get(
    '/matches',
    validate({ query: pantryMatchQuery }), 
    getMatchesForMyPantry
);
router.post('/', validate({ body: addPantryBody}), addPantryItem);
router.delete(
    '/:ingredientId',
    validate({ params: idParam('ingredientId', 'ingredientId') }), 
    removePantryItem);

export default router;