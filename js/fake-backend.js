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
  state.passwords = structuredClone(seed.passwords || {}); // email -> password
  // Read counters exposed to E2E so tests can assert the roster cache prevents
  // re-reading every user's predictions on each navigation / live update.
  const reads = { userPreds: 0, allUsers: 0 };
  if (typeof window !== 'undefined') window.__reads = reads;
  const authListeners = [];
  const notify = () => authListeners.forEach(cb => cb(state.currentUser));
  const newUid = () => `u_${Math.random().toString(36).slice(2, 10)}`;

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

    async loginAsGuest() {
      state.currentUser = { uid: newUid(), displayName: 'Convidado', email: null, photoURL: null, isAnonymous: true };
      notify();
      return state.currentUser;
    },

    async registerWithEmail(email, password, name) {
      if (state.users.some(u => u.email === email)) {
        throw { code: 'auth/email-already-in-use' };
      }
      state.passwords[email] = password;
      state.currentUser = { uid: newUid(), displayName: name, email, photoURL: null, isAnonymous: false };
      notify();
      return state.currentUser;
    },

    async loginWithEmail(email, password) {
      const u = state.users.find(x => x.email === email);
      if (!u) throw { code: 'auth/user-not-found' };
      if (state.passwords[email] !== password) throw { code: 'auth/wrong-password' };
      state.currentUser = { ...u, isAnonymous: false };
      notify();
      return state.currentUser;
    },

    // No real email under the test seam — the link is "completed" via seed.magicLink.
    async sendMagicLink(email, name) { state.pendingMagic = { email, name }; },

    async completeMagicLinkIfPresent() {
      const m = seed.magicLink || state.pendingMagic;
      if (!m) return false;
      const existing = state.users.find(u => u.email === m.email);
      state.currentUser = existing
        ? { ...existing, isAnonymous: false }
        : { uid: newUid(), displayName: m.name || m.email, email: m.email, photoURL: null, isAnonymous: false };
      notify();
      return true;
    },

    // Promote the current guest, keeping the same uid so predictions carry over.
    // Mirrors real linkWithCredential: does NOT fire onAuthChange (same user).
    async upgradeGuest({ email, password, name }) {
      state.passwords[email] = password;
      state.currentUser = { ...state.currentUser, displayName: name || state.currentUser.displayName, email, isAnonymous: false };
      return state.currentUser;
    },

    async upgradeGuestWithGoogle() {
      const g = seed.googleUser || { displayName: 'Google User', photoURL: null };
      state.currentUser = { ...state.currentUser, displayName: g.displayName, photoURL: g.photoURL, email: g.email || null, isAnonymous: false };
      return state.currentUser;
    },

    async saveUser(user) {
      if (user.isAnonymous) return;
      const i = state.users.findIndex(u => u.uid === user.uid);
      const rec = { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL };
      if (i >= 0) state.users[i] = { ...state.users[i], ...rec };
      else state.users.push({ ...rec, createdAt: Date.now() });
    },

    async savePred(uid, matchId, data) {
      if (!state.predictions[uid]) state.predictions[uid] = {};
      state.predictions[uid][matchId] = { ...state.predictions[uid][matchId], ...data };
    },

    async loadPreds(uid) { return structuredClone(state.predictions[uid] || {}); },
    async loadUserPreds(uid) { reads.userPreds++; return structuredClone(state.predictions[uid] || {}); },

    async loadAllUsers() { reads.allUsers++; return structuredClone(state.users); },
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
