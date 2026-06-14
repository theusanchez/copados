// In-memory backend used only under the ?e2e=1 test seam. Seeded from the
// `e2e_seed` localStorage key (set by Playwright before the app boots). Mirrors
// the contract in firebase-backend.js so the rest of the app is unaware.
export function createFakeBackend() {
  let seed = {};
  try { seed = JSON.parse(localStorage.getItem('e2e_seed') || '{}'); } catch { seed = {}; }

  const state = {
    currentUser: seed.currentUser || null,
    users: seed.users ? [...seed.users] : [],
    predictions: structuredClone(seed.predictions || {}),
    results: structuredClone(seed.results || {}),
    leagues: structuredClone(seed.leagues || []),
    resetVersions: structuredClone(seed.resetVersions || {}),
  };
  const authListeners = [];
  const notify = () => authListeners.forEach(cb => cb(state.currentUser));

  // Tests can simulate the ingester updating results by writing the `e2e_results`
  // localStorage key; otherwise we return the seeded results.
  const readResults = () => {
    try {
      const override = localStorage.getItem('e2e_results');
      if (override) return JSON.parse(override);
    } catch { /* ignore */ }
    return structuredClone(state.results);
  };

  return {
    loginWithGoogle: async () => {
      state.currentUser = seed.currentUser || state.users[0] || null;
      notify();
    },
    logout: async () => { state.currentUser = null; notify(); },
    onAuthChange: cb => { authListeners.push(cb); queueMicrotask(() => cb(state.currentUser)); },

    async saveUser(user) {
      const i = state.users.findIndex(u => u.uid === user.uid);
      const rec = { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL };
      if (i >= 0) state.users[i] = { ...state.users[i], ...rec };
      else state.users.push(rec);
    },

    async savePred(uid, matchId, data) {
      if (!state.predictions[uid]) state.predictions[uid] = {};
      state.predictions[uid][matchId] = { ...state.predictions[uid][matchId], ...data };
    },

    async loadPreds(uid) { return structuredClone(state.predictions[uid] || {}); },
    async loadUserPreds(uid) { return structuredClone(state.predictions[uid] || {}); },

    async deletePreds(uid, matchIds) {
      const p = state.predictions[uid];
      if (p) matchIds.forEach(id => delete p[id]);
    },
    async getResetVersion(uid) { return state.resetVersions[uid] || 0; },
    async setResetVersion(uid, version) { state.resetVersions[uid] = version; },
    async loadAllUsers() { return structuredClone(state.users); },
    async loadResults() {
      return readResults();
    },

    // Mirrors the real onSnapshot: emit current results, then re-emit whenever the
    // test-only `e2e_results` override changes (simulating the ingester writing).
    watchResults(cb) {
      cb(readResults());
      let last = JSON.stringify(readResults());
      const iv = setInterval(() => {
        const cur = readResults();
        const sig = JSON.stringify(cur);
        if (sig !== last) { last = sig; cb(cur); }
      }, 400);
      return () => clearInterval(iv);
    },

    // --- Leagues ---
    async createLeague(league) { state.leagues.push(structuredClone(league)); },
    async findLeagueByCode(code) {
      const l = state.leagues.find(x => x.code === code);
      return l ? structuredClone(l) : null;
    },
    async joinLeague(leagueId, uid) {
      const l = state.leagues.find(x => x.id === leagueId);
      if (l && !l.memberUids.includes(uid)) l.memberUids.push(uid);
    },
    async loadUserLeagues(uid) {
      return structuredClone(state.leagues.filter(l => l.memberUids.includes(uid)));
    },
  };
}
