import { test, expect } from '@playwright/test';
import { boot, user, fullPreds } from './helpers.js';

const XSS = '<img src=x onerror="window.__xssFired=true">';

test('a malicious display name is escaped, not executed, in the comparison modal', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), user('evil', XSS)],
    predictions: { me: fullPreds(), evil: fullPreds() },
  });

  await page.locator('.nav-tab[data-view="ranking"]').click();
  await page.locator('.rank-clickable[data-uid="evil"]').click();

  // The injected name renders as text — no <img> element is created from it
  // (flags are imgs, so scope the assertion to the name heading), and onerror never fires.
  const modal = page.locator('#cmp-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.cmp-header h3 img')).toHaveCount(0);
  await expect(modal.locator('.cmp-header h3')).toContainText('onerror');
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
