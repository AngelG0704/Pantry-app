import { MAX_INT } from '../constants.js';
import * as pantryService from '../services/pantryService.js';

export async function getPantry(req, res, next) {
    try {
        const items = await pantryService.listPantry(req.user.id);
        res.json(items);
    } catch (err) {
        next(err);
    }
}

export async function addPantryItem(req, res, next) {
    try {
        const { ingredientId } = req.body ?? {};

        if (!Number.isInteger(ingredientId) || ingredientId < 1 || ingredientId > MAX_INT) {
            return res.status(400).json({ error: 'ingredientId must be a positive integer' });
        }

        const result = await pantryService.addToPantry(req.user.id, ingredientId);
        if (!result){
            return res.status(400).json({ error: 'Unknown ingredient' });
        }

        res.status(result.created ? 201 : 200).json(result.ingredient);
    } catch (err) {
        next(err);
    }
}


export async function removePantryItem(req, res, next) {
    try {
        if (!/^\d+$/.test(req.params.ingredientId)) {
            return res.status(400).json({ error: 'ingredientId must be a postive integer' });
        }

        const ingredientId = Number(req.params.ingredientId);
        if (ingredientId > MAX_INT){
            return res.status(404).json({ error: 'Ingredient not in pantry' });
        }

        const removed = await pantryService.removeFromPantry(req.user.id, ingredientId);
        if (!removed){
            return res.status(404).json({ error: 'Ingredient not in pantry' });
        }

        res.status(204).end();
    } catch (err) {
        next(err);
    }
}