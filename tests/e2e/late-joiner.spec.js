import { test, expect } from '@playwright/test';
import { boot, user, completeGroupPreds } from './helpers.js';

// Regression: a late joiner predicts most group games but a couple already kicked
// off (locked, unfillable). The knockout must still unlock — otherwise they can
// never complete the group stage and are stuck forever.
test('a late joiner with locked group games can still fill the knockout', async ({ page }) => {
  const preds = completeGroupPreds();
  delete preds.A1; // already-finished games the user never got to predict
  delete preds.A2;

  await boot(page, {
    currentUser: user('me', 'Atrasado'),
    users: [user('me', 'Atrasado')],
    predictions: { me: preds },
    results: {
      A1: { status: 'finished', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: 1 },
      A2: { status: 'finished', home: 2, away: 2, homeTeam: 'Coreia do Sul', awayTeam: 'República Tcheca', kickoff: 2 },
    },
    resetVersions: { me: 1 },
  });

  await page.locator('.nav-tab[data-view="knockout"]').click();

  // Knockout is open — no "complete the group stage" lock notice.
  await expect(page.locator('.ko-locked-notice')).toHaveCount(0);

  // And a knockout score input is actually editable.
  const koHome = page.locator('.score-input[data-match-id="R32_01"][data-side="home"]').first();
  await expect(koHome).toBeEditable();
  await koHome.fill('2');
  await koHome.blur();
  await expect(koHome).toHaveValue('2');
});
