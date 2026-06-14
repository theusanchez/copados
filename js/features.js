// Feature flags.
//
// liveScores: shows AO VIVO / INTERVALO badges and the live scoreline on cards.
// Disabled because football-data.org's FREE tier serves DELAYED scores — "live"
// data is unreliable there. Flip to `true` once we're on a paid live-scores plan
// (e.g. football-data.org "Free w/ Livescores"). All the live code stays in place.
export const FEATURES = {
  liveScores: false,
};

// Local override for tests / manual debugging (e.g. localStorage.feature_liveScores).
try {
  const v = localStorage.getItem('feature_liveScores');
  if (v != null) FEATURES.liveScores = v === 'true';
} catch { /* no localStorage (non-browser) */ }
