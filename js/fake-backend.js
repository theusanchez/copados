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
  };
  const authListeners = [];
  const notify = () => authListeners.forEach(cb => cb(state.currentUser));

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
    async loadAllUsers() { return structuredClone(state.users); },
    async loadResults() {
      // Tests can simulate the ingester updating live results between polls by
      // writing to this key; otherwise return the seeded results.
      try {
        const override = localStorage.getItem('e2e_results');
        if (override) return JSON.parse(override);
      } catch { /* ignore */ }
      return structuredClone(state.results);
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
