import { test, expect } from '@playwright/test';

// The egg checkbox only appears if the client started, reached the API on its e2e port
// (so CORS allows it), and the API read the seeded pantry_e2e database.
test('the home page loads the ingredient list from the API', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Pantry App' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'egg' })).toBeVisible();
});
