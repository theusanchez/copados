import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

// Start at the login screen (no seeded currentUser) and exercise the new
// email-based entry points.

test('registering with email enters the app and joins the user list', async ({ page }) => {
  await boot(page, { currentUser: null, users: [] });

  await expect(page.locator('#view-login')).toBeVisible();

  await page.locator('#login-name').fill('Ana Souza');
  await page.locator('#login-email').fill('ana@example.com');
  await page.locator('#login-password').fill('hunter2');
  await page.locator('#btn-email').click();

  await expect(page.locator('#view-app')).toBeVisible();
  await expect(page.locator('#user-info')).toContainText('Ana Souza');

  // A real account shows up for everyone in the ranking.
  await page.locator('.nav-tab[data-view="ranking"]').click();
  await expect(page.locator('#view-ranking')).toContainText('Ana Souza');
});

test('an existing email signs in instead of duplicating the account', async ({ page }) => {
  await boot(page, {
    currentUser: null,
    users: [{ uid: 'u1', displayName: 'Bia', email: 'bia@example.com', photoURL: null }],
    passwords: { 'bia@example.com': 'segredo1' },
  });

  await page.locator('#login-email').fill('bia@example.com');
  await page.locator('#login-password').fill('segredo1');
  await page.locator('#btn-email').click();

  await expect(page.locator('#view-app')).toBeVisible();
  await expect(page.locator('#user-info')).toContainText('Bia');
});

test('a wrong password surfaces an error and stays on login', async ({ page }) => {
  await boot(page, {
    currentUser: null,
    users: [{ uid: 'u1', displayName: 'Bia', email: 'bia@example.com', photoURL: null }],
    passwords: { 'bia@example.com': 'segredo1' },
  });

  await page.locator('#login-email').fill('bia@example.com');
  await page.locator('#login-password').fill('errada');
  await page.locator('#btn-email').click();

  await expect(page.locator('#login-msg')).toContainText('Senha incorreta');
  await expect(page.locator('#view-login')).toBeVisible();
});

test('opening the app from a magic link signs the user in', async ({ page }) => {
  await boot(page, {
    currentUser: null,
    users: [],
    magicLink: { email: 'caio@example.com', name: 'Caio' },
  });

  await expect(page.locator('#view-app')).toBeVisible();
  await expect(page.locator('#user-info')).toContainText('Caio');
});

test('a user saved without a name shows a fallback, never the string "null"', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), { uid: 'x', displayName: null, email: 'x@example.com', photoURL: null }],
    predictions: { x: { A1: { home: 1, away: 0 } } },
  });

  await page.locator('.nav-tab[data-view="ranking"]').click();
  const card = page.locator('#view-ranking .rank-clickable[data-uid="x"]');
  await expect(card).toContainText('Sem nome');
  await expect(card).not.toContainText('null');
});
