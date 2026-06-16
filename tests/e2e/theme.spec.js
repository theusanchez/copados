import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

test('picking a theme applies it, marks the swatch, and persists across reloads', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
  });

  const sunset = page.locator('#view-app .theme-swatch[data-theme-value="sunset"]');
  await sunset.click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunset');
  await expect(sunset).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('sunset');

  // The inline boot script in index.html re-applies it before paint on reload.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunset');
  await expect(page.locator('#view-app .theme-swatch[data-theme-value="sunset"]'))
    .toHaveAttribute('aria-pressed', 'true');
});
