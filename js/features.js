// Feature flags.
//
// liveScores: shows AO VIVO / INTERVALO badges and the live scoreline on cards.
// Enabled 2026-06-14: an external cron (cron-job.org) now triggers the ingester
// every minute via repository_dispatch, and the free data source refreshes match
// records ~every minute, so live data is fresh enough. (No live game-clock minute —
// that field stays paid.) Set back to `false` to hide the live UI without removing it.
export const FEATURES = {
  liveScores: true,
};

// Local override for tests / manual debugging (e.g. localStorage.feature_liveScores).
try {
  const v = localStorage.getItem('feature_liveScores');
  if (v != null) FEATURES.liveScores = v === 'true';
} catch { /* no localStorage (non-browser) */ }
