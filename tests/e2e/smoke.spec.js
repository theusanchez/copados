import { test, expect } from '@playwright/test';
import { boot, user, fullPreds } from './helpers.js';

test('boots into the app with a seeded user', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu Mesmo'),
    users: [user('me', 'Eu Mesmo')],
    predictions: {},
  });

  await expect(page.locator('#view-app')).toBeVisible();
  await expect(page.locator('#user-info')).toContainText('Eu Mesmo');
  // No predictions yet → lands on the groups tab.
  await expect(page.locator('#view-groups')).toBeVisible();
});

test('a saved group prediction round-trips into the standings', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu Mesmo'),
    users: [user('me', 'Eu Mesmo')],
    predictions: {},
  });

  const home = page.locator('.score-input[data-match-id="A1"][data-side="home"]');
  const away = page.locator('.score-input[data-match-id="A1"][data-side="away"]');
  await home.fill('3');
  await away.fill('1');
  await away.blur();

  // México 3x0... A1 is México x África do Sul → México gets 3 pts, shows in standings.
  await expect(page.locator('#standings-A .standings-table')).toContainText('México');
});

test('a fully-filled user opens on the compare tab', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu Mesmo'),
    users: [user('me', 'Eu Mesmo')],
    predictions: { me: fullPreds() },
  });

  await expect(page.locator('#view-compare')).toBeVisible();
});
