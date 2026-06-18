import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

// The SW is disabled under ?e2e=1, so we test the UI layer: app.js listens for the
// `sw-waiting` event (dispatched by the SW registration in index.html) and renders
// the "new version" toast, applying the update via postMessage on tap.

test('shows the update toast when a new version is waiting', async ({ page }) => {
  await boot(page, { currentUser: user('me', 'Eu'), users: [user('me', 'Eu')], predictions: {} });

  await page.evaluate(() => {
    window.__lastMessage = null;
    const fakeWorker = { postMessage: m => { window.__lastMessage = m; } };
    window.dispatchEvent(new CustomEvent('sw-waiting', { detail: fakeWorker }));
  });

  const toast = page.locator('#update-toast');
  await expect(toast).toBeVisible();
  await expect(toast.locator('.update-toast-text')).toContainText('nova versão');

  await toast.locator('.update-toast-action').click();
  expect(await page.evaluate(() => window.__lastMessage)).toEqual({ type: 'SKIP_WAITING' });
});

test('dismissing the update toast hides it', async ({ page }) => {
  await boot(page, { currentUser: user('me', 'Eu'), users: [user('me', 'Eu')], predictions: {} });

  await page.evaluate(() => {
    const fakeWorker = { postMessage: () => {} };
    window.dispatchEvent(new CustomEvent('sw-waiting', { detail: fakeWorker }));
  });

  const toast = page.locator('#update-toast');
  await expect(toast).toBeVisible();
  await toast.locator('.update-toast-close').click();
  await expect(toast).toBeHidden();
});
