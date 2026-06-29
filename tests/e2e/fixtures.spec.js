import { test, expect } from '@playwright/test';
import { boot, user, enableLive, fullPreds } from './helpers.js';
import { resolveKnockout } from '../../js/engine.js';

const HOUR = 3600000;
const DAY = 86400000;

// A predicted bracket derived from the canonical full preds, so we can seed real R32
// matchups that the user nailed (hit → editable, full tier) or missed (gap → read-only).
const KO_PREDS = fullPreds();
const KO = resolveKnockout(KO_PREDS);
const KO_HIT = KO['R32_01'];   // seed R32_01's real teams == predicted → not a gap
const KO_OTHER = KO['R32_05']; // its teams can't equal R32_02's predicted pair → gap

function openFixtures(page) {
  return page.locator('.nav-tab[data-view="fixtures"]').click();
}

test('empty schedule shows a friendly placeholder', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {},
  });
  await openFixtures(page);
  await expect(page.locator('#view-fixtures')).toContainText('calendário aparece aqui');
});

test('matches are split into per-day chips, sorted, with a lock countdown', async ({ page }) => {
  const now = Date.now();
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      // Deliberately seeded out of order to prove sorting.
      B1: { status: 'scheduled', homeTeam: 'Canadá', awayTeam: 'Bósnia e Herzegovina', kickoff: now + 2 * HOUR },
      A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: now + 1 * HOUR },
      A2: { status: 'scheduled', homeTeam: 'Coreia do Sul', awayTeam: 'República Tcheca', kickoff: now + 1 * DAY + HOUR },
    },
  });
  await openFixtures(page);

  // A1/B1 are soon, A2 is a day later → at least two day chips (list shows one day).
  expect(await page.locator('.fx-chip').count()).toBeGreaterThanOrEqual(2);

  // Focus lands on the soonest match's day; A1 (soonest) is the first card and carries
  // the lock countdown. A2, on a later day, isn't in the focused day's list.
  const cards = page.locator('#view-fixtures .fx-card');
  await expect(cards.nth(0)).toHaveAttribute('id', 'fx-match-A1');
  await expect(page.locator('#fx-match-A1 .fx-lock')).toContainText('trava em');
  await expect(page.locator('#fx-match-A2')).toHaveCount(0);

  // The last chip (latest day) reveals A2.
  await page.locator('.fx-chip').last().click();
  await expect(page.locator('#fx-match-A2')).toBeVisible();
});

test('saving a score in the fixtures view syncs to the groups view', async ({ page }) => {
  const now = Date.now();
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: now + 5 * HOUR },
    },
  });
  await openFixtures(page);

  await page.locator('#fx-match-A1 .score-input[data-side="home"]').fill('3');
  const away = page.locator('#fx-match-A1 .score-input[data-side="away"]');
  await away.fill('1');
  await away.blur();

  // Progress reflects it immediately (header chip aria-label carries the detail).
  await expect(page.locator('#progress-chip')).toHaveAttribute('aria-label', /Grupos 1\/72/);

  // The groups view shows the same value (inputs kept in sync across views).
  await page.locator('.nav-tab[data-view="groups"]').click();
  await expect(page.locator('#view-groups .score-input[data-match-id="A1"][data-side="home"]'))
    .toHaveValue('3');
});

test('opening Jogos lands on today, even with a stale unfinished match on an earlier day', async ({ page }) => {
  const now = Date.now();
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      // A past match the ingester never marked 'finished' — must NOT drag the view back.
      A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: now - 2 * DAY },
      B1: { status: 'scheduled', homeTeam: 'Canadá', awayTeam: 'Bósnia e Herzegovina', kickoff: now + 2 * HOUR },
      A2: { status: 'scheduled', homeTeam: 'Coreia do Sul', awayTeam: 'República Tcheca', kickoff: now + 1 * DAY },
    },
  });
  await openFixtures(page);

  // Defaults to today's chip and today's match — not the earliest day in the list.
  await expect(page.locator('.fx-chip.active .fx-chip-top')).toContainText('Hoje');
  await expect(page.locator('#fx-match-B1')).toBeVisible();
  await expect(page.locator('#fx-match-A1')).toHaveCount(0);
});

test('opening Jogos focuses the next match to start (skipping finished ones)', async ({ page }) => {
  const now = Date.now();
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'finished', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: now - 2 * HOUR },
      B1: { status: 'scheduled', homeTeam: 'Canadá', awayTeam: 'Bósnia e Herzegovina', kickoff: now + 1 * HOUR },
      A2: { status: 'scheduled', homeTeam: 'Coreia do Sul', awayTeam: 'República Tcheca', kickoff: now + 1 * DAY },
    },
  });
  await openFixtures(page);

  await expect(page.locator('#fx-match-B1')).toHaveClass(/\bfx-focus\b/);
  await expect(page.locator('#fx-match-A1')).not.toHaveClass(/\bfx-focus\b/);
  // A2 is on a later day, so it isn't in the focused day's list at all.
  await expect(page.locator('#fx-match-A2')).toHaveCount(0);
});

test('opening Jogos focuses the live match when one is in play', async ({ page }) => {
  await enableLive(page);
  const now = Date.now();
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'finished', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: now - 2 * HOUR },
      B1: { status: 'live', home: 0, away: 0, homeTeam: 'Canadá', awayTeam: 'Bósnia e Herzegovina', kickoff: now },
      A2: { status: 'scheduled', homeTeam: 'Coreia do Sul', awayTeam: 'República Tcheca', kickoff: now + 1 * DAY },
    },
  });
  await openFixtures(page);

  await expect(page.locator('#fx-match-B1')).toHaveClass(/\bfx-focus\b/);
});

test('logging in with complete preds lands on Jogos focused on the next match', async ({ page }) => {
  const now = Date.now();
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: fullPreds() },
    results: {
      A1: { status: 'finished', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: now - 2 * HOUR },
      B1: { status: 'scheduled', homeTeam: 'Canadá', awayTeam: 'Bósnia e Herzegovina', kickoff: now + 1 * HOUR },
    },
  });

  // No openFixtures() click: the focus must happen on login alone.
  await expect(page.locator('.nav-tab[data-view="fixtures"]')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#fx-match-B1')).toHaveClass(/\bfx-focus\b/);
  await expect(page.locator('#fx-match-A1')).not.toHaveClass(/\bfx-focus\b/);
});

test('a live match in the fixtures list shows the AO VIVO badge', async ({ page }) => {
  await enableLive(page);
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'live', home: 2, away: 1, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
    },
  });
  await openFixtures(page);
  await expect(page.locator('#fx-match-A1')).toHaveClass(/\blive\b/);
  await expect(page.locator('#fx-match-A1 .live-score')).toContainText('2 × 1');
});

// Bug 1: a knockout slot the user got wrong shows the OFFICIAL teams in the Jogos list,
// but stays read-only — entering a score there must not leak into the predicted bracket.
test('a wrong-matchup knockout slot is read-only and points to Oficial', async ({ page }) => {
  const future = Date.now() + 6 * HOUR;
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: KO_PREDS },
    results: {
      R32_02: { status: 'scheduled', homeTeam: KO_OTHER.homeTeam, awayTeam: KO_OTHER.awayTeam, kickoff: future },
    },
  });
  await openFixtures(page);

  const gap = page.locator('#fx-match-R32_02');
  await expect(gap).toHaveClass(/\bfx-gap\b/);
  await expect(gap).toContainText(KO_OTHER.homeTeam);   // the REAL home team, not the predicted one
  await expect(gap.locator('.score-input')).toHaveCount(0); // no editable inputs → can't corrupt the bracket
  await expect(gap.locator('.fx-gap-hint')).toBeVisible();

  // The hint deep-links into the Mata-Mata › Oficial fill screen.
  await gap.locator('.fx-gap-hint').click();
  await expect(page.locator('.nav-tab[data-view="knockout"]')).toHaveClass(/\bactive\b/);
  await expect(page.locator('.gp-view-btn[data-koview="official"]')).toHaveClass(/\bactive\b/);
});

// Bug 2: a knockout slot the user can edit in the Jogos list must offer the penalty
// winner once the predicted scoreline is a draw, and persist the choice.
test('knockout fixture: penalty winner can be picked on a drawn scoreline', async ({ page }) => {
  const future = Date.now() + 6 * HOUR;
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: { me: KO_PREDS },
    results: {
      R32_01: { status: 'scheduled', homeTeam: KO_HIT.homeTeam, awayTeam: KO_HIT.awayTeam, kickoff: future },
    },
  });
  await openFixtures(page);

  const card = page.locator('#fx-match-R32_01');
  await expect(card).not.toHaveClass(/\bfx-gap\b/);
  await expect(page.locator('#fx-pen-R32_01')).toHaveClass(/\bhidden\b/); // not a draw yet

  await card.locator('.score-input[data-side="home"]').fill('1');
  const away = card.locator('.score-input[data-side="away"]');
  await away.fill('1');
  await away.blur();

  const pen = page.locator('#fx-pen-R32_01');
  await expect(pen).not.toHaveClass(/\bhidden\b/);
  await pen.locator(`.fx-pen-radio[value="${KO_HIT.homeTeam}"]`).check();

  // The choice survives a re-render (navigate away and back).
  await page.locator('.nav-tab[data-view="groups"]').click();
  await openFixtures(page);
  await expect(page.locator(`#fx-pen-R32_01 .fx-pen-radio[value="${KO_HIT.homeTeam}"]`)).toBeChecked();
});
