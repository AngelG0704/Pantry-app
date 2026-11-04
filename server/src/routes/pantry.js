import { Router } from "express";
import {
    getPantry,
    addPantryItem,
    removePantryItem,
    setPantryExpiry,
} from '../controllers/pantryController.js';
import { getMatchesForMyPantry } from "../controllers/recipeController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import {
    addPantryBody,
    idParam,
    pantryMatchQuery,
    pantryExpiryBody,
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
router.patch(
    '/:ingredientId',
    validate({
        params: idParam('ingredientId', 'ingredientId'),
        body: pantryExpiryBody,
    }),
    setPantryExpiry
);

export default router;