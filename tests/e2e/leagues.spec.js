import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

function openLeagues(page) {
  return page.locator('.nav-tab[data-view="leagues"]').click();
}

async function setActive(page, id) {
  await page.addInitScript(v => localStorage.setItem('active_league', v), id);
}

test('creating a league makes it active and shows a shareable code', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    leagues: [],
  });
  await openLeagues(page);

  await page.locator('#input-create').fill('Família');
  await page.locator('#form-create button[type="submit"]').click();

  const card = page.locator('.league-card.active');
  await expect(card).toContainText('Família');
  await expect(card.locator('.league-badge')).toHaveText('Ativa');
  await expect(card.locator('.league-code strong')).toHaveText(/^[A-Z2-9]{6}$/);

  // Ranking is now scoped to the new league.
  await page.locator('.nav-tab[data-view="ranking"]').click();
  await expect(page.locator('#view-ranking .compare-header h2')).toContainText('Família');
});

test('ranking is scoped to active league members and Geral shows everyone', async ({ page }) => {
  await setActive(page, 'lg1');
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), user('alice', 'Alice'), user('bob', 'Bob')],
    predictions: {},
    results: {
      A1: { status: 'finished', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
    },
    leagues: [
      { id: 'lg1', name: 'Trio', code: 'TRIO22', ownerUid: 'me', memberUids: ['me', 'alice'] },
    ],
  });

  await page.locator('.nav-tab[data-view="ranking"]').click();
  await expect(page.locator('#view-ranking .compare-header h2')).toContainText('Trio');
  await expect(page.locator('.ranking-name')).toHaveCount(2);
  await expect(page.locator('#view-ranking')).toContainText('Alice');
  await expect(page.locator('#view-ranking')).not.toContainText('Bob');

  // Switch to Geral via the switcher → all three show up.
  await page.locator('#view-ranking .league-select').selectOption('geral');
  await expect(page.locator('.ranking-name')).toHaveCount(3);
  await expect(page.locator('#view-ranking')).toContainText('Bob');
});

test('joining by code adds the user and activates the league', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), user('alice', 'Alice')],
    predictions: {},
    leagues: [
      { id: 'lg9', name: 'Amigos', code: 'AMIGOS', ownerUid: 'alice', memberUids: ['alice'] },
    ],
  });
  await openLeagues(page);

  await page.locator('#input-join').fill('amigos');
  await page.locator('#form-join button[type="submit"]').click();

  const card = page.locator('.league-card.active');
  await expect(card).toContainText('Amigos');
  await expect(card).toContainText('2 membros');
});

test('joining with an unknown code shows an error', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    leagues: [],
  });
  await openLeagues(page);

  await page.locator('#input-join').fill('ZZZZZZ');
  await page.locator('#form-join button[type="submit"]').click();
  await expect(page.locator('#league-msg')).toContainText('não encontrada');
});

test('opening with ?join=CODE auto-joins the league', async ({ page }) => {
  await page.addInitScript(d => localStorage.setItem('e2e_seed', JSON.stringify(d)), {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), user('alice', 'Alice')],
    predictions: {},
    leagues: [
      { id: 'lg5', name: 'Convidados', code: 'CONVID', ownerUid: 'alice', memberUids: ['alice'] },
    ],
  });
  await page.goto('/index.html?e2e=1&join=CONVID');

  await page.locator('.nav-tab[data-view="leagues"]').click();
  await expect(page.locator('.league-card.active')).toContainText('Convidados');
  // The join param is stripped from the URL after consuming it.
  await expect(page).toHaveURL(/\?e2e=1$/);
});

test('copy invite writes the join link', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    leagues: [
      { id: 'lg2', name: 'Bolão', code: 'BOLAO7', ownerUid: 'me', memberUids: ['me'] },
    ],
  });
  await openLeagues(page);

  const copyBtn = page.locator('.league-card', { hasText: 'Bolão' }).locator('.league-copy');
  await copyBtn.click();
  await expect(copyBtn).toHaveText('Convite copiado!');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('?join=BOLAO7');
});
