import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

test('the theme toggle flips dark ⇄ light and persists across reloads', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
  });

  // Default is dark (no data-theme attribute).
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');

  const toggle = page.locator('#btn-theme');
  await toggle.click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

  // The inline boot script in index.html re-applies it before paint on reload.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#btn-theme')).toHaveAttribute('aria-pressed', 'true');

  // Toggling back returns to dark and drops the attribute.
  await page.locator('#btn-theme').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
});

test('a legacy saved theme name falls back to dark', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'sunset'));
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
});
