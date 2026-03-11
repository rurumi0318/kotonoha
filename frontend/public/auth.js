import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  signInWithPopup,
  getRedirectResult,
  onAuthStateChanged,
  signOut as _signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

export async function handleRedirectResult() {
  if (isLocalhost) return;
  await getRedirectResult(auth);
}

export function onAuthChange(callback) {
  onAuthStateChanged(auth, callback);
}

export async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

export async function signInWithGoogle() {
  if (isLocalhost) {
    await signInWithPopup(auth, provider);
  } else {
    await signInWithRedirect(auth, provider);
  }
}

export async function signOut() {
  await _signOut(auth);
}
