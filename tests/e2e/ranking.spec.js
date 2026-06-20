import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

// Group A round 1 = A1, A2 · round 2 = A3, A4.
const RESULTS_R1 = {
  A1: { status: 'finished', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: 1 },
  A2: { status: 'finished', home: 2, away: 2, homeTeam: 'Coreia do Sul', awayTeam: 'República Tcheca', kickoff: 2 },
};
const RESULTS_R2 = {
  A3: { status: 'finished', home: 0, away: 1, homeTeam: 'República Tcheca', awayTeam: 'África do Sul', kickoff: 3 },
  A4: { status: 'finished', home: 3, away: 1, homeTeam: 'México', awayTeam: 'Coreia do Sul', kickoff: 4 },
};

const PREDS = {
  me:    { A1: { home: 1, away: 0 }, A2: { home: 0, away: 0 }, A3: { home: 0, away: 1 }, A4: { home: 3, away: 1 } }, // 5+3+5+5 = 18
  alice: { A1: { home: 2, away: 0 }, A2: { home: 1, away: 1 }, A3: { home: 0, away: 2 }, A4: { home: 2, away: 0 } }, // 3+3+3+3 = 12
  bob:   { A1: { home: 1, away: 0 }, A2: { home: 3, away: 3 }, A3: { home: 2, away: 0 }, A4: { home: 0, away: 2 } }, // 5+3+0+0 = 8
};

const USERS = [user('me', 'Eu'), user('alice', 'Alice'), user('bob', 'Bob')];

function rows(page) {
  return page.locator('#view-ranking .ranking-row');
}

// Top 3 render on the podium (data-pos 1..3); positions 4+ are list rows.
const podium = (page, pos) => page.locator(`#view-ranking .podium-card[data-pos="${pos}"]`);

test('single played round shows round points and no movement (estreia)', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: USERS,
    predictions: PREDS,
    results: { ...RESULTS_R1 },
  });
  await page.locator('.nav-tab[data-view="ranking"]').click();

  await expect(page.locator('.ranking-round-note')).toContainText('Rodada 1 (grupos)');
  // After R1: Bob 8, Eu 8 (tiebreak by name → Bob first), Alice 6.
  await expect(podium(page, 1)).toContainText('Bob');
  await expect(podium(page, 1).locator('.rank-move-flat')).toBeVisible();
  await expect(podium(page, 1).locator('.ranking-round-pts')).toHaveText('+8');
});

test('podium with long names never overflows the viewport horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [
      user('me', 'Eu da Silva Sauro Magalhães'),
      user('alice', 'Alice Aparecida Albuquerque'),
      user('bob', 'Bob Bartolomeu Bittencourt'),
    ],
    predictions: PREDS,
    results: { ...RESULTS_R1 },
  });
  await page.locator('.nav-tab[data-view="ranking"]').click();
  await expect(podium(page, 1)).toBeVisible();

  // The podium must fit; a wider scrollWidth means it bleeds the page horizontally.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('round selector scopes the ranking to a single round', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: USERS,
    predictions: PREDS,
    results: { ...RESULTS_R1, ...RESULTS_R2 },
  });
  await page.locator('.nav-tab[data-view="ranking"]').click();

  const scope = page.locator('.rank-scope');
  await expect(scope).toBeVisible();
  await expect(scope.locator('.rank-scope-btn')).toHaveCount(3); // Geral + Rodada 1 + Rodada 2

  // Overall: Eu leads with the accumulated 18.
  await expect(podium(page, 1)).toContainText('Eu');
  await expect(podium(page, 1).locator('.podium-total')).toContainText('18');

  // Round 1 only: Eu 8, Bob 8, Alice 6 → Bob tops on the name tiebreak.
  await page.locator('.rank-scope-btn[data-scope="0"]').click();
  await expect(podium(page, 1)).toContainText('Bob');

  // Round 2 only: Eu 10, Alice 6, Bob 0 → Eu tops with just that round's points.
  await page.locator('.rank-scope-btn[data-scope="1"]').click();
  await expect(podium(page, 1)).toContainText('Eu');
  await expect(podium(page, 1).locator('.podium-total')).toContainText('10');
  // Per-round view drops the "+X this round" delta chip.
  await expect(page.locator('#view-ranking .ranking-round-pts')).toHaveCount(0);
  // ...and shows the round's date instead.
  await expect(page.locator('#view-ranking .ranking-round-note')).toContainText('Disputada em');
});

test('second round recomputes points and position movement', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: USERS,
    predictions: PREDS,
    results: { ...RESULTS_R1, ...RESULTS_R2 },
  });
  await page.locator('.nav-tab[data-view="ranking"]').click();

  await expect(page.locator('.ranking-round-note')).toContainText('Rodada 2 (grupos)');

  // Final order: Eu 18, Alice 12, Bob 8.
  const p1 = podium(page, 1), p2 = podium(page, 2), p3 = podium(page, 3);

  await expect(p1).toContainText('Eu');
  await expect(p1.locator('.podium-total')).toContainText('18');
  await expect(p1.locator('.rank-move-up')).toHaveText('▲1'); // was 2nd after R1
  await expect(p1.locator('.ranking-round-pts')).toHaveText('+10');

  await expect(p2).toContainText('Alice');
  await expect(p2.locator('.rank-move-up')).toHaveText('▲1'); // was 3rd
  await expect(p2.locator('.ranking-round-pts')).toHaveText('+6');

  await expect(p3).toContainText('Bob');
  await expect(p3.locator('.rank-move-down')).toHaveText('▼2'); // was 1st
  await expect(p3.locator('.ranking-round-pts')).toHaveCount(0); // scored 0 this round
});
