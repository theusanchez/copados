import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

const base = {
  currentUser: user('me', 'Eu'),
  users: [user('me', 'Eu')],
  predictions: {},
  results: {},
};

test('Seleções grid lists teams grouped by group', async ({ page }) => {
  await boot(page, base);
  await page.locator('.nav-tab[data-view="teams"]').click();

  await expect(page.locator('#view-teams .team-group-label').first()).toContainText('Grupo A');
  await expect(page.locator('#view-teams .team-card[data-team="Brasil"]')).toBeVisible();
  // Each card carries a self-describing honours line (titles + appearances).
  await expect(page.locator('.team-card[data-team="Brasil"] .team-card-line')).toContainText('5 títulos');
  await expect(page.locator('.team-card[data-team="Brasil"] .team-card-line')).toContainText('23 Copas');
  // Debutants show a debut marker instead.
  await expect(page.locator('.team-card[data-team="Curaçao"] .team-card-line')).toContainText('Estreante');
});

test('sorting by titles puts champions first', async ({ page }) => {
  await boot(page, base);
  await page.locator('.nav-tab[data-view="teams"]').click();
  await page.locator('#view-teams .group-tab[data-sort="titles"]').click();

  // Group labels disappear in non-group modes; Brazil (5 titles) leads.
  await expect(page.locator('#view-teams .team-group-label')).toHaveCount(0);
  await expect(page.locator('#view-teams .team-card').first()).toHaveAttribute('data-team', 'Brasil');
});

test('sorting A–Z orders teams alphabetically', async ({ page }) => {
  await boot(page, base);
  await page.locator('.nav-tab[data-view="teams"]').click();
  await page.locator('#view-teams .group-tab[data-sort="alpha"]').click();

  const names = await page.locator('#view-teams .team-card-name').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
});

test('team detail shows honours, coach and squad by position', async ({ page }) => {
  await boot(page, base);
  await page.locator('.nav-tab[data-view="teams"]').click();
  await page.locator('.team-card[data-team="Brasil"]').click();

  const detail = page.locator('#view-teams .team-detail');
  await expect(detail.locator('.team-detail-name')).toHaveText('Brasil');
  await expect(detail.locator('.team-coach')).toContainText('Técnico');
  // Static honours from data.js: 5 titles, best "Campeão".
  await expect(detail.locator('.team-stat-val').first()).toHaveText('5');
  await expect(detail).toContainText('Campeão');
  // Squad grouped by position, populated from the baked js/squads.js.
  await expect(detail.locator('.squad-group-label', { hasText: 'Goleiros' })).toBeVisible();
  await expect(detail.locator('.squad-player').first()).toBeVisible();
});

test('back button returns from detail to the grid', async ({ page }) => {
  await boot(page, base);
  await page.locator('.nav-tab[data-view="teams"]').click();
  await page.locator('.team-card[data-team="Argentina"]').click();
  await expect(page.locator('#view-teams .team-detail')).toBeVisible();

  await page.locator('#view-teams .team-back').click();
  await expect(page.locator('#view-teams .team-grid').first()).toBeVisible();
  await expect(page.locator('.team-card[data-team="Argentina"]')).toBeVisible();
});
