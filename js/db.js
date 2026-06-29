// Backend facade. Selects the real Firebase backend, or an in-memory fake when
// the app is loaded with ?e2e=1 (used by the Playwright E2E suite). The rest of
// the app imports only from here and is unaware of which backend is live.
const E2E = typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('e2e');

const backend = E2E
  ? (await import('./fake-backend.js')).createFakeBackend()
  : (await import('./firebase-backend.js')).createFirebaseBackend();

export const loginWithGoogle = (...a) => backend.loginWithGoogle(...a);
export const logout = (...a) => backend.logout(...a);
export const onAuthChange = (...a) => backend.onAuthChange(...a);
export const loginAsGuest = (...a) => backend.loginAsGuest(...a);
export const registerWithEmail = (...a) => backend.registerWithEmail(...a);
export const loginWithEmail = (...a) => backend.loginWithEmail(...a);
export const sendMagicLink = (...a) => backend.sendMagicLink(...a);
export const completeMagicLinkIfPresent = (...a) => backend.completeMagicLinkIfPresent(...a);
export const upgradeGuest = (...a) => backend.upgradeGuest(...a);
export const upgradeGuestWithGoogle = (...a) => backend.upgradeGuestWithGoogle(...a);
export const saveUser = (...a) => backend.saveUser(...a);
export const savePred = (...a) => backend.savePred(...a);
export const saveKoLive = (...a) => backend.saveKoLive(...a);
export const loadKoLive = (...a) => backend.loadKoLive(...a);
export const loadUserData = (...a) => backend.loadUserData(...a);
export const loadPreds = (...a) => backend.loadPreds(...a);
export const loadUserPreds = (...a) => backend.loadUserPreds(...a);
export const loadAllUsers = (...a) => backend.loadAllUsers(...a);
export const loadResults = (...a) => backend.loadResults(...a);
export const watchResults = (...a) => backend.watchResults(...a);

export const createLeague = (...a) => backend.createLeague(...a);
export const findLeagueByCode = (...a) => backend.findLeagueByCode(...a);
export const joinLeague = (...a) => backend.joinLeague(...a);
export const loadUserLeagues = (...a) => backend.loadUserLeagues(...a);
