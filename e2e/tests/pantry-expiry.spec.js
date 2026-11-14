import { test, expect } from '@playwright/test';
import {
  addToPantry,
  openPantry,
  pantryRow,
  recipeCard,
  register,
  setExpiry,
  uniqueEmail,
} from './helpers.js';

test('expiry badges and the "Use soon" label follow the 3-day rule', async ({ page }) => {
  // "Today" is 2026-11-10 in the browser (time zone pinned to New York in the config).
  // The offset makes this the same instant whatever time zone runs the tests.
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00-05:00'));

  await register(page, uniqueEmail('expiry'));
  await openPantry(page);
  await addToPantry(page, ['egg', 'butter', 'cheese']);

  await setExpiry(page, 'egg', '2026-11-10', 'Nov 10, 2026'); // today
  await setExpiry(page, 'butter', '2026-11-13', 'Nov 13, 2026'); // exactly 3 days: the boundary
  await setExpiry(page, 'cheese', '2026-11-09', 'Nov 9, 2026'); // yesterday

  await expect(pantryRow(page, 'egg')).toContainText('Soon · expires Nov 10, 2026');
  await expect(pantryRow(page, 'butter')).toContainText('Soon · expires Nov 13, 2026');
  await expect(pantryRow(page, 'cheese')).toContainText('Expired · expires Nov 9, 2026');

  // Soon items only, soonest first; the expired cheese is left out.
  const useSoon = (title) => recipeCard(page, title).getByText(/^Use soon:/);
  await expect(useSoon('Scrambled eggs')).toHaveText('Use soon: egg (today), butter (in 3 days)');
  await expect(useSoon('Cheese omelette')).toHaveText('Use soon: egg (today), butter (in 3 days)');
  await expect(useSoon('Grilled cheese')).toHaveText('Use soon: butter (in 3 days)');
});
