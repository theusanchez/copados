import { test, expect } from '@playwright/test';
import { boot, user, fullPreds, completeGroupPreds } from './helpers.js';
import { resolveKnockout } from '../../js/engine.js';

// Build a deterministic predicted bracket from the canonical full preds (group + KO
// scorelines), so we can seed real R32 matchups that match (cravado) or differ (gap)
// on purpose — and the cravado has a predicted scoreline to score 5/3 against.
const PREDS = fullPreds();
const KO = resolveKnockout(PREDS);
const FUTURE = Date.now() + 6 * 3600 * 1000;

// R32_01: real matchup == predicted → cravado (5/3, frozen).
// R32_02: real matchup == a DIFFERENT slot's predicted pair → guaranteed mismatch → gap (2/1).
const HIT = KO['R32_01'];
const OTHER = KO['R32_05']; // its teams can't equal R32_02's predicted pair (each team is in one slot)

function baseResults(extra = {}) {
  return {
    R32_01: { status: 'scheduled', homeTeam: HIT.homeTeam, awayTeam: HIT.awayTeam, kickoff: FUTURE },
    R32_02: { status: 'scheduled', homeTeam: OTHER.homeTeam, awayTeam: OTHER.awayTeam, kickoff: FUTURE },
    ...extra,
  };
}

const SEED = {
  currentUser: user('me', 'Eu'),
  users: [user('me', 'Eu')],
  predictions: { me: PREDS },
  results: baseResults(),
};

test('boot lands on the guided fill screen when the bracket left gaps', async ({ page }) => {
  await boot(page, SEED);

  // Auto-routed into the Mata-Mata in Oficial mode with the fill header.
  await expect(page.locator('#view-knockout')).toBeVisible();
  await expect(page.locator('.ko-fill-head')).toBeVisible();
  await expect(page.locator('.gp-view-btn[data-koview="official"]')).toHaveClass(/\bactive\b/);

  // The gap (R32_02) renders as an editable live-pick card with the real teams.
  const gap = page.locator('#match-R32_02');
  await expect(gap).toHaveClass(/ko-live-card/);
  await expect(gap.locator('.ko-live-input')).toHaveCount(2);
  await expect(gap).toContainText(OTHER.homeTeam);

  // The nailed slot (R32_01) renders as a read-only cravado card with the 5/3 badge.
  const cravado = page.locator('#match-R32_01');
  await expect(cravado).toHaveClass(/ko-cravado-card/);
  await expect(cravado.locator('.ko-badge-cravado')).toBeVisible();
  await expect(cravado.locator('.ko-live-input')).toHaveCount(0);
});

test('toggle flips between my bracket and the official fill screen', async ({ page }) => {
  await boot(page, SEED);
  await expect(page.locator('.ko-fill-head')).toBeVisible();

  await page.locator('.gp-view-btn[data-koview="bracket"]').click();
  await expect(page.locator('.ko-chips')).toBeVisible(); // predicted bracket has the round chips
  await expect(page.locator('.ko-fill-head')).toHaveCount(0);

  await page.locator('.gp-view-btn[data-koview="official"]').click();
  await expect(page.locator('.ko-fill-head')).toBeVisible();
});

test('filling a gap persists in-session (no read on toggle round-trip)', async ({ page }) => {
  await boot(page, SEED);
  await page.locator('#match-R32_02 .ko-live-input[data-side="home"]').fill('2');
  const away = page.locator('#match-R32_02 .ko-live-input[data-side="away"]');
  await away.fill('1');
  await away.blur();

  // Toggle away and back: the saved live pick is reflected from local state.
  await page.locator('.gp-view-btn[data-koview="bracket"]').click();
  await page.locator('.gp-view-btn[data-koview="official"]').click();
  await expect(page.locator('#match-R32_02 .ko-live-input[data-side="home"]')).toHaveValue('2');
  await expect(page.locator('#match-R32_02 .ko-live-input[data-side="away"]')).toHaveValue('1');
});

test('a finished live re-pick scores the reduced 2/1 tier', async ({ page }) => {
  // Seed the live pick + a finished result matching it exactly → 2 points (live exact).
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: PREDS },
    koLive: { me: { R32_02: { home: 2, away: 1 } } },
    results: baseResults({
      R32_02: { status: 'finished', home: 2, away: 1, homeTeam: OTHER.homeTeam, awayTeam: OTHER.awayTeam },
    }),
  });

  await page.locator('.nav-tab[data-view="knockout"]').click();
  await page.locator('.gp-view-btn[data-koview="official"]').click();
  const card = page.locator('#match-R32_02');
  await expect(card).toContainText('+2');
  await expect(card.locator('.ko-badge-live')).toBeVisible();
});

test('a nailed (cravado) slot keeps the full 5/3 tier', async ({ page }) => {
  // R32_01 real == predicted; finish it on the predicted scoreline → exact 5.
  const ph = HIT.homeTeam === KO['R32_01'].homeTeam ? KO['R32_01'].home : KO['R32_01'].away;
  const pa = HIT.homeTeam === KO['R32_01'].homeTeam ? KO['R32_01'].away : KO['R32_01'].home;
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: PREDS },
    results: baseResults({
      R32_01: { status: 'finished', home: ph, away: pa, homeTeam: HIT.homeTeam, awayTeam: HIT.awayTeam },
    }),
  });

  await page.locator('.nav-tab[data-view="knockout"]').click();
  await page.locator('.gp-view-btn[data-koview="official"]').click();
  await expect(page.locator('#match-R32_01')).toContainText('+5');
});

test('a stale live re-pick never overrides a nailed cravado', async ({ page }) => {
  // A slot the user nailed in their bracket (R32_01) that also carries a leftover live
  // re-pick with a WRONG score — the state left behind when a gap becomes a cravado after
  // the bracket allocation shifts. The cravado must still score the full 5, not the 2/1
  // (or 0) tier of the orphaned re-pick.
  const ph = HIT.homeTeam === KO['R32_01'].homeTeam ? KO['R32_01'].home : KO['R32_01'].away;
  const pa = HIT.homeTeam === KO['R32_01'].homeTeam ? KO['R32_01'].away : KO['R32_01'].home;
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: PREDS },
    koLive: { me: { R32_01: { home: ph + 1, away: pa + 2 } } }, // stale, wrong re-pick
    results: baseResults({
      R32_01: { status: 'finished', home: ph, away: pa, homeTeam: HIT.homeTeam, awayTeam: HIT.awayTeam },
    }),
  });

  await page.locator('.nav-tab[data-view="knockout"]').click();
  await page.locator('.gp-view-btn[data-koview="official"]').click();
  const card = page.locator('#match-R32_01');
  await expect(card).toContainText('+5');
  await expect(card).not.toContainText('+2');
});

test('a nailed matchup with no predicted scoreline is a fillable gap, not a null cravado', async ({ page }) => {
  // The chefinho case: the user only predicted the group stage, so the bracket resolves
  // the R32_01 teams but there's no KO scoreline behind it. The matchup is "right" yet
  // there's nothing to freeze at 5/3 — it must render as an editable 2/1 gap, never a
  // cravado card showing "null × null".
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: completeGroupPreds() },
    results: {
      R32_01: { status: 'scheduled', homeTeam: HIT.homeTeam, awayTeam: HIT.awayTeam, kickoff: FUTURE },
    },
  });

  const card = page.locator('#match-R32_01');
  await expect(card).toHaveClass(/ko-live-card/);
  await expect(card).not.toHaveClass(/ko-cravado-card/);
  await expect(card.locator('.ko-live-input')).toHaveCount(2);
  await expect(card.locator('.ko-badge-cravado')).toHaveCount(0);
  await expect(card).not.toContainText('null');
});
