import { test, expect } from '@playwright/test';
import { boot, user, fullPreds } from './helpers.js';
import { predictedChampion } from '../../js/engine.js';
import { GROUPS } from '../../js/data.js';

function meRow(page) {
  return page.locator('#view-ranking .ranking-row').first();
}

test('leader, round-top and hot-streak badges', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), user('alice', 'Alice')],
    predictions: {
      me:    { A1: { home: 1, away: 0 }, A2: { home: 2, away: 1 }, A3: { home: 0, away: 2 } }, // 3 exact in a row
      alice: { A1: { home: 0, away: 1 }, A2: { home: 1, away: 1 }, A3: { home: 1, away: 0 } }, // all wrong
    },
    results: {
      A1: { status: 'finished', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: 1 },
      A2: { status: 'finished', home: 2, away: 1, homeTeam: 'Coreia do Sul', awayTeam: 'República Tcheca', kickoff: 2 },
      A3: { status: 'finished', home: 0, away: 2, homeTeam: 'República Tcheca', awayTeam: 'África do Sul', kickoff: 3 },
    },
  });
  await page.locator('.nav-tab[data-view="ranking"]').click();

  const badges = meRow(page).locator('.ach-badge');
  await expect(badges).toHaveCount(3);
  await expect(meRow(page).locator('.ach-badge[title*="Líder"]')).toBeVisible();
  await expect(meRow(page).locator('.ach-badge[title*="cravadas na rodada"]')).toBeVisible();
  await expect(meRow(page).locator('.ach-badge[title*="Em chamas"]')).toBeVisible();

  // Alice (last place, all wrong) earns no badges.
  await expect(page.locator('#view-ranking .ranking-row').nth(1).locator('.ach-badge')).toHaveCount(0);
});

test('perfect-group and Nostradamus badges', async ({ page }) => {
  const preds = fullPreds();
  const champ = predictedChampion(preds);
  const groupA = GROUPS.A.matches;

  const results = {};
  // Mirror the user's group-A scorelines exactly → a perfect group.
  groupA.forEach((m, i) => {
    results[m.id] = {
      status: 'finished', home: preds[m.id].home, away: preds[m.id].away,
      homeTeam: m.home, awayTeam: m.away, kickoff: i + 1,
    };
  });
  // A finished final whose winner equals the user's predicted champion.
  results.FINAL = {
    status: 'finished', home: 2, away: 1,
    homeTeam: champ, awayTeam: champ === 'Brasil' ? 'Argentina' : 'Brasil', kickoff: 999,
  };

  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: preds },
    results,
  });
  await page.locator('.nav-tab[data-view="ranking"]').click();

  await expect(meRow(page).locator('.ach-badge[title*="Grupo perfeito"]')).toBeVisible();
  await expect(meRow(page).locator('.ach-badge[title*="Nostradamus"]')).toBeVisible();
});
