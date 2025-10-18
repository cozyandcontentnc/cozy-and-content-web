// src/lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "firebase/auth";

// NOTE: best practice is to move these into .env.local and read via process.env.NEXT_PUBLIC_*.
// Keeping your current values for now.
const firebaseConfig = {
  apiKey: "AIzaSyA9YJl8mP-ILswqVHH7QVNdZo4-jvk_RTs",
  authDomain: "cozy-and-content.firebaseapp.com",
  projectId: "cozy-and-content",
  // FIX: Storage bucket host should be appspot.com
  storageBucket: "cozy-and-content.appspot.com",
  messagingSenderId: "8334047711",
  appId: "1:8334047711:web:c3f4d583d2fad90ff9ac6a",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Optional offline persistence (safe no-op if unsupported)
try { enableIndexedDbPersistence(db); } catch {}

/**
 * ensureAuth({ allowAnonymous = false })
 * - If a user is already signed in, resolves immediately with that user.
 * - If no user:
 *    - if allowAnonymous === true, attempts signInAnonymously(); if provider is disabled, returns null.
 *    - if allowAnonymous === false, returns null (caller decides whether to redirect to /account/login).
 */
export function ensureAuth(opts = {}) {
  const { allowAnonymous = false } = opts;

  // Already signed in
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  // Wait for the initial auth state
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        unsub();
        if (u) return resolve(u);

        // Not signed in; attempt anonymous only if explicitly allowed
        if (allowAnonymous) {
          try {
            const cred = await signInAnonymously(auth);
            return resolve(cred.user);
          } catch (e) {
            // If anonymous is not enabled, avoid throwing auth/operation-not-allowed here
            console.error("Anonymous sign-in failed (likely not enabled):", e?.code || e);
            return resolve(null);
          }
        }

        // Caller must handle login flow
        resolve(null);
      },
      () => {
        // onAuthStateChanged error — return null so caller can handle
        resolve(null);
      }
    );
  });
}
