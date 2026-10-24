import { z } from 'zod';
import { MAX_INT } from '../constants.js';

const MAX_MATCH_IDS = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INGREDIENTS_REQUIRED = 'ingredients is required, e.g. ?ingredients=1,2,3';

// A string of digits, converted to a number.
function digitsToNumber(message) {
  return z.string({ message }).regex(/^\d+$/, message).transform(Number);
}

// Route parameters such as /:id (format only; "too large to exist" is a 404 in the controller)
export function idParam(name, label) {
  return z.object({
    [name]: digitsToNumber(`${label} must be a positive integer`),
  });
}

const maxMissing = digitsToNumber('maxMissing must be a non-negative integer')
  .pipe(z.number().max(MAX_INT, 'maxMissing must be a non-negative integer'))
  .optional();

export const matchQuery = z.object({
  ingredients: z
    .string({ message: INGREDIENTS_REQUIRED })
    .min(1, INGREDIENTS_REQUIRED)
    .transform((value) => value.split(','))
    .pipe(
      z.array(
        z
          .string()
          .regex(/^\d+$/, 'ingredients must be a comma-separated list of positive integers')
      )
    )
    .transform((parts) => [...new Set(parts.map(Number))])
    .pipe(
      z
        .array(z.number().max(MAX_INT, 'Ingredient id out of range'))
        .max(MAX_MATCH_IDS, `Too many ingredients (maximum ${MAX_MATCH_IDS})`)
    ),
  maxMissing,
});

export const pantryMatchQuery = z.object({ maxMissing });

export const addPantryBody = z.object({
  ingredientId: z
    .number({ message: 'ingredientId must be a positive integer' })
    .int('ingredientId must be a positive integer')
    .min(1, 'ingredientId must be a positive integer')
    .max(MAX_INT, 'ingredientId must be a positive integer'),
});

const emailField = z
  .string({ message: 'email is required' })
  .trim()
  .toLowerCase();

export const registerBody = z.object({
  email: emailField
    .max(254, 'A valid email is required')
    .regex(EMAIL_PATTERN, 'A valid email is required'),
  password: z
    .string({ message: 'password is required' })
    .min(8, 'Password must be at least 8 characters')
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= 72,
      'Password must be at most 72 bytes'
    ),
});

export const loginBody = z.object({
  email: emailField,
  password: z.string({ message: 'password is required' }),
});