import { test, expect } from '@playwright/test';
import { boot, user, fullPreds, completeGroupPreds } from './helpers.js';

// Progress is shown as a compact chip in the header: the count of completed
// predictions as text, with the full "Grupos X/72 · Mata-mata Y/32" breakdown in
// its aria-label.

test('shows the completed count and detail for an empty bolão', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
  });

  const chip = page.locator('#progress-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('0');
  await expect(chip).toHaveAttribute('aria-label', /Grupos 0\/72/);
  await expect(chip).toHaveAttribute('aria-label', /Mata-mata 0\/32/);
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

  await expect(page.locator('#progress-chip')).toContainText('1');
  await expect(page.locator('#progress-chip')).toHaveAttribute('aria-label', /Grupos 1\/72/);
});

test('group-only preds count toward grupos but not mata-mata', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: completeGroupPreds() },
  });

  await expect(page.locator('#progress-chip')).toHaveAttribute('aria-label', /Grupos 72\/72/);
  await expect(page.locator('#progress-chip')).toHaveAttribute('aria-label', /Mata-mata 0\/32/);
});

test('a complete bolão marks the chip complete', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: fullPreds() },
  });

  const chip = page.locator('#progress-chip');
  await expect(chip).toHaveClass(/complete/);
  await expect(chip).toContainText('104');
  await expect(chip).toHaveAttribute('aria-label', /Bolão completo/);
});
