import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  initializeAuth, browserLocalPersistence, browserPopupRedirectResolver,
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
  signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  EmailAuthProvider, linkWithCredential, linkWithPopup,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, updateDoc, getDocs, onSnapshot,
  collection, query, where, arrayUnion, serverTimestamp,
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

  // All of a user's predictions live in a single doc (`predictions/{uid}`) under a
  // `matches` map, so reading a whole user costs ONE read instead of one-per-match.
  // This is what keeps ranking/compare (which read every scoped user) within quota.
  async function loadPreds(uid) {
    const snap = await getDoc(doc(db, 'predictions', uid));
    return (snap.exists() && snap.data().matches) || {};
  }

  return {
    loginWithGoogle: () => signInWithPopup(auth, provider, browserPopupRedirectResolver),
    logout: () => signOut(auth),
    onAuthChange: cb => onAuthStateChanged(auth, cb),

    loginAsGuest: () => signInAnonymously(auth),

    async registerWithEmail(email, password, name) {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      // Always set a display name so a user never lands in the roster as "null".
      await updateProfile(user, { displayName: name || email.split('@')[0] });
      return user;
    },

    loginWithEmail: (email, password) => signInWithEmailAndPassword(auth, email, password),

    // Passwordless: email the user a link back to this same page. We remember the
    // email (and chosen name) locally so completeMagicLinkIfPresent can finish it.
    async sendMagicLink(email, name) {
      localStorage.setItem('magicEmail', email);
      if (name) localStorage.setItem('magicName', name);
      await sendSignInLinkToEmail(auth, email, {
        url: location.origin + location.pathname,
        handleCodeInApp: true,
      });
    },

    // Run on boot: if the current URL is a sign-in link, complete the login.
    async completeMagicLinkIfPresent() {
      if (!isSignInWithEmailLink(auth, location.href)) return false;
      const email = localStorage.getItem('magicEmail');
      if (!email) return false;
      const { user } = await signInWithEmailLink(auth, email, location.href);
      // Email-link users have no display name; derive one so they never show as "null".
      if (!user.displayName) {
        const name = localStorage.getItem('magicName');
        await updateProfile(user, { displayName: name || email.split('@')[0] });
      }
      localStorage.removeItem('magicEmail');
      localStorage.removeItem('magicName');
      history.replaceState(null, '', location.origin + location.pathname);
      return true;
    },

    // Promote the current anonymous user to a permanent account, keeping the same
    // uid (so their predictions carry over).
    async upgradeGuest({ email, password, name }) {
      const cred = EmailAuthProvider.credential(email, password);
      const { user } = await linkWithCredential(auth.currentUser, cred);
      if (name) await updateProfile(user, { displayName: name });
      return user;
    },

    async upgradeGuestWithGoogle() {
      const { user } = await linkWithPopup(auth.currentUser, provider);
      return user;
    },

    async saveUser(user) {
      // Guests (anonymous) stay out of the `users` collection so they never show
      // up in ranking/compare. On upgrade the uid persists and they get saved.
      if (user.isAnonymous) return;
      // Don't persist email: this doc is readable by every signed-in user
      // (ranking/compare need displayName + photoURL), so email would leak as PII.
      // Firebase Auth already holds the email for the account owner.
      const ref = doc(db, 'users', user.uid);
      const payload = {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        updatedAt: serverTimestamp(),
      };
      // Stamp createdAt exactly once (powers the admin "last registered" list). One
      // read per login session — negligible next to the roster reads ranking does.
      const snap = await getDoc(ref);
      if (!snap.exists() || !snap.data().createdAt) payload.createdAt = serverTimestamp();
      await setDoc(ref, payload, { merge: true });
    },

    // Deep-merge a single match into the `matches` map: only that key changes, the
    // rest of the user's predictions are untouched. One write per saved score.
    async savePred(uid, matchId, data) {
      await setDoc(doc(db, 'predictions', uid), {
        matches: { [matchId]: data },
        updatedAt: serverTimestamp(),
      }, { merge: true });
    },

    // Knockout live re-picks share the same doc under a `koLive` map (so loading a
    // user is still one read). Same deep-merge contract as savePred.
    async saveKoLive(uid, matchId, data) {
      await setDoc(doc(db, 'predictions', uid), {
        koLive: { [matchId]: data },
        updatedAt: serverTimestamp(),
      }, { merge: true });
    },

    async loadKoLive(uid) {
      const snap = await getDoc(doc(db, 'predictions', uid));
      return (snap.exists() && snap.data().koLive) || {};
    },

    // Bulk loader for the roster: both maps in ONE read (ranking scores every user
    // and needs each user's koLive to score the knockout correctly).
    async loadUserData(uid) {
      const snap = await getDoc(doc(db, 'predictions', uid));
      const d = snap.exists() ? snap.data() : {};
      return { matches: d.matches || {}, koLive: d.koLive || {} };
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

    // Real-time subscription to the results collection. Firestore pushes only
    // changed docs (billed per changed doc, not per second), so this is both
    // instant and far cheaper than polling. Returns an unsubscribe function.
    watchResults(cb) {
      return onSnapshot(collection(db, 'results'), snap => {
        const out = {};
        snap.forEach(d => { out[d.id] = d.data(); });
        cb(out);
      });
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
  };
}
