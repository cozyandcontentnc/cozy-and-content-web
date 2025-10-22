// src/lib/firebase.js
"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getStorage } from "firebase/storage";

/**
 * Firebase Web API keys are NOT secrets, but you should:
 *  - store them in env (to avoid scanners/alerts),
 *  - rotate & restrict the key in Google Cloud.
 *
 * This module prefers env vars and falls back to your current literals
 * so your app keeps working while you migrate.
 */

const envConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // Correct bucket host uses appspot.com
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Fallback to your existing inline values if envs are missing (migration-safe)
const fallbackConfig = {
  apiKey: "AIzaSyA9YJl8mP-ILswqVHH7QVNdZo4-jvk_RTs",
  authDomain: "cozy-and-content.firebaseapp.com",
  projectId: "cozy-and-content",
  // ✅ fix: use appspot.com, not firebasestorage.app
  storageBucket: "cozy-and-content.appspot.com",
  messagingSenderId: "8334047711",
  appId: "1:8334047711:web:c3f4d583d2fad90ff9ac6a",
};

// Choose env when available; otherwise fallback
const firebaseConfig = {
  apiKey: envConfig.apiKey || fallbackConfig.apiKey,
  authDomain: envConfig.authDomain || fallbackConfig.authDomain,
  projectId: envConfig.projectId || fallbackConfig.projectId,
  storageBucket: envConfig.storageBucket || fallbackConfig.storageBucket,
  messagingSenderId: envConfig.messagingSenderId || fallbackConfig.messagingSenderId,
  appId: envConfig.appId || fallbackConfig.appId,
};

// Gentle heads-up in dev if we’re using fallbacks
if (process.env.NODE_ENV !== "production") {
  const missing = Object.entries(envConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[firebase] Using fallback config. Missing env vars: ${missing.join(
        ", "
      )}. Add them to .env.local`
    );
  }
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Enable offline persistence in the browser (ignore expected errors)
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((err) => {
    // "failed-precondition" = multiple tabs open with persistence
    // "unimplemented"      = browser doesn’t support IndexedDB
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[firebase] IndexedDB persistence not enabled:", err?.code || err);
    }
  });
}

/**
 * ensureAuth({ allowAnonymous = true })
 * - Resolves to a user (existing or anonymous), or null if not available.
 * - Default keeps your current behavior working out of the box.
 */
export function ensureAuth(opts = {}) {
  const { allowAnonymous = true } = opts;

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
            if (process.env.NODE_ENV !== "production") {
              // eslint-disable-next-line no-console
              console.error("Anonymous sign-in failed (is it enabled in Firebase Auth?):", e?.code || e);
            }
            return resolve(null);
          }
        }

        resolve(null);
      },
      () => resolve(null)
    );
  });
}
