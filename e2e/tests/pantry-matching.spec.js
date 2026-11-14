import { test, expect } from '@playwright/test';
import {
  addToPantry,
  openPantry,
  pantryList,
  recipeCard,
  register,
  uniqueEmail,
} from './helpers.js';

test('pantry items are saved and recipes are matched against them', async ({ page }) => {
  await register(page, uniqueEmail('matching'));
  await openPantry(page);

  await addToPantry(page, ['egg', 'butter', 'cheese']);

  // Saved on the server and listed: one row each, nothing else.
  const list = pantryList(page);
  await expect(list.getByRole('listitem')).toHaveCount(3);
  for (const name of ['butter', 'cheese', 'egg']) {
    await expect(list.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeVisible();
  }

  // The counts come from the real API: exact numbers, so a renamed or missing
  // field ("undefined of 3 ingredients") can't pass.
  const omelette = recipeCard(page, 'Cheese omelette');
  await expect(omelette).toContainText('3 of 3 ingredients');
  await expect(omelette).toContainText('You can make this now.');

  const grilledCheese = recipeCard(page, 'Grilled cheese');
  await expect(grilledCheese).toContainText('2 of 3 ingredients');
  await expect(grilledCheese).toContainText('You still need: bread');
});
