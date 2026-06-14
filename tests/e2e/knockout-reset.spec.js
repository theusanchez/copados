import { test, expect } from '@playwright/test';
import { boot, user, fullPreds } from './helpers.js';

test('knockout picks are wiped and a notice is shown for un-migrated users', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: fullPreds() }, // full bolão incl. knockout
    resetVersions: {},                // never migrated → reset runs
  });

  await expect(page.locator('#reset-notice')).toBeVisible();
  await expect(page.locator('#reset-notice')).toContainText('mata-mata');

  // Group picks kept, knockout cleared.
  await expect(page.locator('#progress-tracker')).toContainText('Grupos 72/72');
  await expect(page.locator('#progress-tracker')).toContainText('Mata-mata 0/32');

  // Dismissible.
  await page.locator('.reset-notice-close').click();
  await expect(page.locator('#reset-notice')).toBeHidden();
});

test('no reset or notice for users already on the current version', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: fullPreds() },
    resetVersions: { me: 1 }, // already migrated
  });

  await expect(page.locator('#reset-notice')).toBeHidden();
  // Knockout untouched → bolão still complete.
  await expect(page.locator('#progress-tracker')).toContainText('Bolão completo');
});

test('no notice for users who never filled the knockout', async ({ page }) => {
  // Group-only preds, un-migrated: nothing to delete, so no notice.
  const groupOnly = {};
  Object.assign(groupOnly, fullPreds());
  for (const k of Object.keys(groupOnly)) if (!/^[A-L][1-6]$/.test(k)) delete groupOnly[k];

  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: groupOnly },
    resetVersions: {},
  });

  await expect(page.locator('#reset-notice')).toBeHidden();
});
