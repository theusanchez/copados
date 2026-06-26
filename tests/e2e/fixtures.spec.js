import { test, expect } from '@playwright/test';
import { boot, user, enableLive, fullPreds } from './helpers.js';

const HOUR = 3600000;
const DAY = 86400000;

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
  await expect(page.locator('#fx-match-A1 .fx-countdown')).toContainText('trava em');
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
