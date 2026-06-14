import { test, expect } from '@playwright/test';
import { boot, user, fullPreds, completeGroupPreds } from './helpers.js';

test('shows remaining count and detail for an empty bolão', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
  });

  const tracker = page.locator('#progress-tracker');
  await expect(tracker).toBeVisible();
  await expect(tracker).toContainText('Faltam 104 de 104 palpites');
  await expect(tracker).toContainText('Grupos 0/72');
  await expect(tracker).toContainText('Mata-mata 0/32');
});

test('updates the count as a prediction is saved', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
  });

  await page.locator('.score-input[data-match-id="A1"][data-side="home"]').fill('2');
  const away = page.locator('.score-input[data-match-id="A1"][data-side="away"]');
  await away.fill('1');
  await away.blur();

  await expect(page.locator('#progress-tracker')).toContainText('Grupos 1/72');
  await expect(page.locator('#progress-tracker')).toContainText('Faltam 103 de 104');
});

test('group-only preds count toward grupos but not mata-mata', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: completeGroupPreds() },
  });

  await expect(page.locator('#progress-tracker')).toContainText('Grupos 72/72');
  await expect(page.locator('#progress-tracker')).toContainText('Mata-mata 0/32');
});

test('a complete bolão shows the completion message', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: fullPreds() },
    resetVersions: { me: 1 }, // already migrated → keep the full bolão
  });

  const tracker = page.locator('#progress-tracker');
  await expect(tracker).toHaveClass(/complete/);
  await expect(tracker).toContainText('Bolão completo');
});
