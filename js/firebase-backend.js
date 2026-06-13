import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  initializeAuth, browserLocalPersistence, browserPopupRedirectResolver,
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where,
  arrayUnion, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';

// Real Firebase implementation of the backend contract (see db.js for the facade).
export function createFirebaseBackend() {
  const app = initializeApp(firebaseConfig);
  const auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();

  async function loadPreds(uid) {
    const snap = await getDocs(collection(db, 'predictions', uid, 'matches'));
    const out = {};
    snap.forEach(d => { out[d.id] = d.data(); });
    return out;
  }

  return {
    loginWithGoogle: () => signInWithPopup(auth, provider, browserPopupRedirectResolver),
    logout: () => signOut(auth),
    onAuthChange: cb => onAuthStateChanged(auth, cb),

    async saveUser(user) {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    },

    async savePred(uid, matchId, data) {
      await setDoc(doc(db, 'predictions', uid, 'matches', matchId), {
        ...data,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    },

    loadPreds,
    loadUserPreds: loadPreds,

    async loadAllUsers() {
      const snap = await getDocs(collection(db, 'users'));
      const users = [];
      snap.forEach(d => users.push(d.data()));
      return users;
    },

    async loadResults() {
      const snap = await getDocs(collection(db, 'results'));
      const out = {};
      snap.forEach(d => { out[d.id] = d.data(); });
      return out;
    },

    // --- Leagues ---
    async createLeague(league) {
      await setDoc(doc(db, 'leagues', league.id), {
        ...league,
        createdAt: serverTimestamp(),
      });
    },

    async findLeagueByCode(code) {
      const snap = await getDocs(query(collection(db, 'leagues'), where('code', '==', code)));
      let found = null;
      snap.forEach(d => { if (!found) found = d.data(); });
      return found;
    },

    async joinLeague(leagueId, uid) {
      await updateDoc(doc(db, 'leagues', leagueId), { memberUids: arrayUnion(uid) });
    },

    async loadUserLeagues(uid) {
      const snap = await getDocs(query(collection(db, 'leagues'), where('memberUids', 'array-contains', uid)));
      const out = [];
      snap.forEach(d => out.push(d.data()));
      return out;
    },

    async getLeague(leagueId) {
      const d = await getDoc(doc(db, 'leagues', leagueId));
      return d.exists() ? d.data() : null;
    },
  };
}
