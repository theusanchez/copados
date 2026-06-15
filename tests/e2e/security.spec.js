import { test, expect } from '@playwright/test';
import { boot, user, fullPreds } from './helpers.js';

const XSS = '<img src=x onerror="window.__xssFired=true">';

test('a malicious display name is escaped, not executed, in compare', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), user('evil', XSS)],
    predictions: { me: fullPreds(), evil: fullPreds() },
  });

  await page.locator('.nav-tab[data-view="compare"]').click();

  // The injected name renders as text — no <img> element is created from it,
  // and its onerror never fires.
  await expect(page.locator('.compare-name img')).toHaveCount(0);
  await expect(page.locator('.compare-name', { hasText: 'onerror' })).toBeVisible();
  expect(await page.evaluate(() => window.__xssFired)).toBeFalsy();
});

test('a malicious display name is escaped in the ranking', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), user('evil', XSS)],
    predictions: { me: fullPreds(), evil: fullPreds() },
  });

  await page.locator('.nav-tab[data-view="ranking"]').click();

  await expect(page.locator('.ranking-name img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xssFired)).toBeFalsy();
});
