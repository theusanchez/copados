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

const seedData = () => ({
  currentUser: user('boss', 'Boss'),
  users: [user('boss', 'Boss'), user('alice', 'Alice')],
  predictions: {
    boss: fullPreds(),
    alice: { A1: { home: 1, away: 0 } },
  },
  results: {
    A1: {
      status: 'finished', home: 2, away: 0,
      homeTeam: 'México', awayTeam: 'África do Sul', kickoff: 1, updatedAt: Date.now(),
    },
  },
});

test('admin sees the Admin tab and the dashboard cards', async ({ page }) => {
  await boot(page, seedData());

  const tab = page.locator('.nav-tab[data-view="admin"]');
  await expect(tab).toBeVisible();
  await tab.click();

  const view = page.locator('#view-admin');
  await expect(view.locator('.admin-card-title')).toHaveCount(5);
  await expect(view).toContainText('Saúde do sistema');
  await expect(view).toContainText('Estimativa de leituras');
  await expect(view).toContainText('Últimos cadastrados');
  await expect(view).toContainText('Engajamento');
  await expect(view).toContainText('Visão geral do bolão');
  // Engagement table lists both users in scope.
  await expect(view.locator('.admin-table tbody tr')).toHaveCount(2);
});

test('admin sees the last registered users, newest first and capped at 15', async ({ page }) => {
  const now = Date.now();
  const users = Array.from({ length: 18 }, (_, i) =>
    user('u' + i, 'Player ' + i, { createdAt: now - i * 3600000 }));
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

  // Recent list is capped at 15 and ordered newest-first (u0 created most recently).
  const recent = view.locator('.admin-recent li');
  await expect(recent).toHaveCount(15);
  await expect(recent.first()).toContainText('Player 0');
});

test('non-admin never sees the Admin tab', async ({ page }) => {
  await boot(page, seedData(), { admin: false });
  await expect(page.locator('.nav-tab[data-view="admin"]')).toBeHidden();
});
