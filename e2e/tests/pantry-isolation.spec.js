import { test, expect } from '@playwright/test';
import {
  addToPantry,
  openPantry,
  pantryList,
  pantryRow,
  register,
  uniqueEmail,
} from './helpers.js';

test("one user's pantry is never shown to another", async ({ page, browser }) => {
  // User A: the test's own page. User B: a second context (its own storage, so its own token).
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  try {
    await register(page, uniqueEmail('isolation-a'));
    await openPantry(page);
    await addToPantry(page, ['egg']);

    // B starts with nothing, even though A's egg is saved on the same server.
    // openPantry waits for the pantry to load, so a count of 0 can't pass early; and the
    // count goes first because its failure says how many rows leaked ("Received: 4").
    await register(pageB, uniqueEmail('isolation-b'));
    await openPantry(pageB);
    await expect(pantryList(pageB).getByRole('listitem')).toHaveCount(0);
    await expect(pageB.getByText('Your pantry is empty.', { exact: false })).toBeVisible();

    // And the other way round: B's butter never reaches A.
    await addToPantry(pageB, ['butter']);
    await page.reload();
    await expect(pantryList(page).getByRole('listitem')).toHaveCount(1);
    await expect(pantryRow(page, 'egg')).toBeVisible();
  } finally {
    await contextB.close();
  }
});
