import { expect } from '@playwright/test';

// Every test registers its own user, so tests never depend on each other or on leftovers.
// Lowercase only: the server lowercases emails, and the header shows what it stored.
export function uniqueEmail(label = 'user') {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

// 8 to 72 bytes is what the server accepts.
export const PASSWORD = 'correct horse battery';

// The header's "Account" navigation: the logged-in state lives here.
export function accountNav(page) {
  return page.getByRole('navigation', { name: 'Account' });
}

// Logged in as this user: the header shows their email and a Log out button.
export async function expectLoggedIn(page, email) {
  const nav = accountNav(page);
  await expect(nav.getByRole('link', { name: email, exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Log out' })).toBeVisible();
}

// Logged out: Log in and Register links instead, no Log out button.
export async function expectLoggedOut(page) {
  const nav = accountNav(page);
  await expect(nav.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Register' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Log out' })).toHaveCount(0);
}

export async function register(page, email, password = PASSWORD) {
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password (at least 8 characters)', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectLoggedIn(page, email);
}

export async function logIn(page, email, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  // A button, so it can't be confused with the header's "Log in" link.
  await page.getByRole('button', { name: 'Log in' }).click();
  await expectLoggedIn(page, email);
}

export async function logOut(page) {
  await accountNav(page).getByRole('button', { name: 'Log out' }).click();
  await expectLoggedOut(page);
}

// Waits until the pantry has loaded, not just the page: the picker only appears once both
// the catalog and the pantry are ready, so "no rows" after this means none, not "not yet".
export async function openPantry(page) {
  await page.goto('/pantry');
  await expect(page.getByRole('heading', { level: 2, name: 'My pantry' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Add or remove ingredients' })
  ).toBeVisible();
}

// Ticks each ingredient in "Add or remove ingredients" and waits until the server has
// answered. The tick is optimistic (shown at once, undone if the server refuses), and the
// box is disabled while the request is pending: enabled again and still ticked = saved.
export async function addToPantry(page, names) {
  for (const name of names) {
    const box = page.getByRole('checkbox', { name, exact: true });
    await box.check();
    await expect(box).toBeEnabled();
    await expect(box).toBeChecked();
  }
}

// The "In your pantry" list (one listitem per item).
export function pantryList(page) {
  return page.getByRole('list', { name: 'In your pantry' });
}

// One row of "In your pantry", found by the item's name (rows move when the sort applies).
export function pantryRow(page, name) {
  return pantryList(page)
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) });
}

// Opens the row, saves an expiry date ("YYYY-MM-DD"), waits for the row to show it, closes it.
export async function setExpiry(page, name, date, shownAs) {
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await page.getByLabel(`Expiry date for ${name}`, { exact: true }).fill(date);
  await page.getByRole('button', { name: `Save expiry date for ${name}`, exact: true }).click();
  await expect(pantryRow(page, name)).toContainText(`expires ${shownAs}`);
  await page.getByRole('button', { name: `Close ${name}`, exact: true }).click();
}

// One recipe card in "Recipes you can make", found by its title.
export function recipeCard(page, title) {
  return page
    .getByRole('region', { name: 'Recipes you can make' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}
