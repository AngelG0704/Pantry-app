import { test, expect } from '@playwright/test';
import {
  addToPantry,
  openPantry,
  pantryList,
  register,
  setExpiry,
  uniqueEmail,
} from './helpers.js';

// Each row's text starts with the item's name ("eggNo amount · expires …"), so these
// check the names in order without depending on the rest of the row.
const inOrder = (names) => names.map((name) => new RegExp(`^${name}`));

test('"Expiry: latest first" reverses the dated rows and keeps undated ones last', async ({ page }) => {
  // The order depends only on the dates, not on today, so no fixed clock here.
  await register(page, uniqueEmail('sort'));
  await openPantry(page);
  await addToPantry(page, ['egg', 'cheese', 'butter', 'milk']);

  await setExpiry(page, 'egg', '2026-11-12', 'Nov 12, 2026');
  await setExpiry(page, 'cheese', '2026-11-15', 'Nov 15, 2026');
  await setExpiry(page, 'butter', '2026-11-20', 'Nov 20, 2026');
  // milk: no date

  const rows = pantryList(page).getByRole('listitem');

  // The default, "Expiry: soonest first".
  await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('expiry-asc');
  await expect(rows).toHaveText(inOrder(['egg', 'cheese', 'butter', 'milk']));

  await page.getByLabel('Sort by', { exact: true }).selectOption({ label: 'Expiry: latest first' });
  await expect(rows).toHaveText(inOrder(['butter', 'cheese', 'egg', 'milk']));
});
