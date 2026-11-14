import { test } from '@playwright/test';
import {
  expectLoggedIn,
  logIn,
  logOut,
  register,
  uniqueEmail,
} from './helpers.js';

test('register, log out, and log back in with the same credentials', async ({ page }) => {
  const email = uniqueEmail('auth');

  // Each helper waits for the header to show the state it just caused.
  await register(page, email);
  await logOut(page);
  await logIn(page, email);

  // The session survives a reload: the stored token is sent back and accepted.
  await page.reload();
  await expectLoggedIn(page, email);
});
