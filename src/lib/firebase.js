// src/lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";

// NOTE: move these to .env.local later; keeping your current values for now.
const firebaseConfig = {
  apiKey: "AIzaSyA9YJl8mP-ILswqVHH7QVNdZo4-jvk_RTs",
  authDomain: "cozy-and-content.firebaseapp.com",
  projectId: "cozy-and-content",
  storageBucket: "cozy-and-content.firebasestorage.app",
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
 */
export function ensureAuth(opts = {}) {
  const { allowAnonymous = false } = opts;

  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        unsub();
        if (u) return resolve(u);

        if (allowAnonymous) {
          try {
            const cred = await signInAnonymously(auth);
            return resolve(cred.user);
          } catch (e) {
            console.error("Anonymous sign-in failed (likely not enabled):", e?.code || e);
            return resolve(null);
          }
        }

        resolve(null);
      },
      () => resolve(null)
    );
  });
}
