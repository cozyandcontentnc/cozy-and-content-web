// src/lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

// Paste your Firebase Web config from Firebase Console → Project settings → Your apps → Web
const firebaseConfig = {
  apiKey: "AIzaSyA9YJl8mP-ILswqVHH7QVNdZo4-jvk_RTs",
  authDomain: "cozy-and-content.firebaseapp.com",
  projectId: "cozy-and-content",
  storageBucket: "cozy-and-content.firebasestorage.app",
  messagingSenderId: "8334047711",
  appId: "1:8334047711:web:c3f4d583d2fad90ff9ac6a"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

try { enableIndexedDbPersistence(db); } catch (e) { /* ignore */ }

export async function ensureAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
}
