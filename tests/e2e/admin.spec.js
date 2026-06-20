import { test, expect } from '@playwright/test';
import { seed, user, fullPreds } from './helpers.js';

// Boot with the seeded current user optionally flagged as admin (via the
// `admin_uids` localStorage override that ADMIN_UIDS reads under ?e2e=1).
async function boot(page, data, { admin = true } = {}) {
  await seed(page, data);
  if (admin) {
    await page.addInitScript(uid => localStorage.setItem('admin_uids', uid), data.currentUser.uid);
  }
  await page.goto('/index.html?e2e=1');
}

const now = Date.now();
const seedData = () => ({
  currentUser: user('boss', 'Boss', { createdAt: now - 1000, updatedAt: now - 1000 }),
  users: [
    user('boss', 'Boss', { createdAt: now - 1000, updatedAt: now - 1000 }),
    user('alice', 'Alice', { createdAt: now - 2000, updatedAt: now - 2000 }),
  ],
  predictions: {
    boss: fullPreds(),
    alice: { A1: { home: 1, away: 0 } },
  },
  results: {
    A1: {
      status: 'finished', home: 2, away: 0,
      homeTeam: 'México', awayTeam: 'África do Sul', kickoff: 1, updatedAt: now,
    },
  },
});

test('admin sees the Admin tab and the dashboard cards', async ({ page }) => {
  await boot(page, seedData());

  const tab = page.locator('.nav-tab[data-view="admin"]');
  await expect(tab).toBeVisible();
  await tab.click();

  const view = page.locator('#view-admin');
  await expect(view.locator('.admin-card-title')).toHaveCount(6);
  await expect(view).toContainText('Saúde do sistema');
  await expect(view).toContainText('Estimativa de leituras');
  await expect(view).toContainText('Últimos acessos');
  await expect(view).toContainText('Últimos cadastros');
  await expect(view).toContainText('Engajamento');
  await expect(view).toContainText('Visão geral do bolão');
  // Engagement table lists both users in scope.
  await expect(view.locator('.admin-table tbody tr')).toHaveCount(2);
});

test('access list orders by last login, registration list by signup — independently', async ({ page }) => {
  const base = Date.now();
  // createdAt: u0 newest signup, u15 oldest. updatedAt: the reverse (u15 most recent).
  const users = Array.from({ length: 16 }, (_, i) =>
    user('u' + i, 'Player ' + i, { createdAt: base - i * 3600000, updatedAt: base - (15 - i) * 3600000 }));
  await boot(page, {
    currentUser: users[0],
    users,
    predictions: { u0: fullPreds() },
    results: {},
    leagues: [],
  });

  const tab = page.locator('.nav-tab[data-view="admin"]');
  await tab.click();
  const view = page.locator('#view-admin');

  const regs = view.locator('.admin-card', { hasText: 'Últimos cadastros' }).locator('li');
  const access = view.locator('.admin-card', { hasText: 'Últimos acessos' }).locator('li');

  // Both capped at 15.
  await expect(regs).toHaveCount(15);
  await expect(access).toHaveCount(15);

  // u0 (current user) just logged in, so it tops both lists.
  await expect(regs.first()).toContainText('Player 0');
  await expect(access.first()).toContainText('Player 0');

  // Discriminator: 2nd by signup is u1; 2nd by last access is u15 (newest seeded login).
  await expect(regs.nth(1)).toContainText('Player 1');
  await expect(access.nth(1)).toContainText('Player 15');
});

test('non-admin never sees the Admin tab', async ({ page }) => {
  await boot(page, seedData(), { admin: false });
  await expect(page.locator('.nav-tab[data-view="admin"]')).toBeHidden();
});
