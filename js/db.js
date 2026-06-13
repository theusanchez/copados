import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  initializeAuth, browserLocalPersistence, browserPopupRedirectResolver,
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDocs, collection, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();

export const loginWithGoogle = () =>
  signInWithPopup(auth, provider, browserPopupRedirectResolver);
export const logout = () => signOut(auth);
export const onAuthChange = cb => onAuthStateChanged(auth, cb);

export async function saveUser(user) {
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Save a single prediction { home: N, away: N } (plus penWinner for knockout)
export async function savePred(uid, matchId, data) {
  await setDoc(doc(db, 'predictions', uid, 'matches', matchId), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Load all predictions for a user: returns { matchId: {home,away,...} }
export async function loadPreds(uid) {
  const snap = await getDocs(collection(db, 'predictions', uid, 'matches'));
  const out = {};
  snap.forEach(d => { out[d.id] = d.data(); });
  return out;
}

// Load all users
export async function loadAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  const users = [];
  snap.forEach(d => users.push(d.data()));
  return users;
}

// Load predictions for a specific user (read-only, for compare view)
export async function loadUserPreds(uid) {
  return loadPreds(uid);
}

// Load actual match results written by the results Cloud Function: { matchId: {...} }
export async function loadResults() {
  const snap = await getDocs(collection(db, 'results'));
  const out = {};
  snap.forEach(d => { out[d.id] = d.data(); });
  return out;
}
