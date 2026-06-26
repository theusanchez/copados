import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

const me = () => ({ currentUser: user('me', 'Me'), users: [user('me', 'Me')], predictions: {} });

test('defaults to Portuguese', async ({ page }) => {
  await boot(page, me());
  await expect(page.locator('.nav-tab[data-view="knockout"]')).toContainText('Mata-Mata');
  await expect(page.locator('#view-app .lang-btn[data-lang="pt"]')).toHaveAttribute('aria-pressed', 'true');
});

test('lang=en translates the interface', async ({ page }) => {
  // Persisted preference is read before the app boots (same as the switcher + reload).
  await page.addInitScript(() => localStorage.setItem('lang', 'en'));
  await boot(page, me());

  await expect(page.locator('.nav-tab[data-view="knockout"]')).toContainText('Knockout');
  await expect(page.locator('.nav-tab[data-view="leagues"]')).toContainText('Leagues');
  await expect(page.locator('#btn-logout')).toContainText('Log out');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#view-app .lang-btn[data-lang="en"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the EN switcher persists across reloads', async ({ page }) => {
  await boot(page, me());
  // The language switcher lives in the account menu (behind the avatar) now.
  await page.locator('#btn-user').click();
  await page.locator('#user-menu .lang-btn[data-lang="en"]').click(); // triggers reload
  await expect(page.locator('.nav-tab[data-view="groups"]')).toContainText('Groups');
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');
});
