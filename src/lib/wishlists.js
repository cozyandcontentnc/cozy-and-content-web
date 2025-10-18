// src/lib/wishlists.js
import { db } from "./firebase";
import {
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  addDoc,
  collection,
} from "firebase/firestore";

/** Create a short share id */
function makeShareId(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const arr = new Uint32Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Create a list and return its id (or update updatedAt if it exists) */
export async function createList(uid, name = "New List", idMaybe) {
  const id = idMaybe || crypto.randomUUID?.() || Math.random().toString(36).slice(2);
  const ref = doc(db, "users", uid, "wishlists", id);
  const base = {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isPublic: false,
    shareId: null,
  };
  await setDoc(ref, base, { merge: true });
  return id;
}

/** Rename a list */
export async function renameList(uid, listId, newName) {
  await updateDoc(doc(db, "users", uid, "wishlists", listId), {
    name: newName,
    updatedAt: serverTimestamp(),
  });
}

/** Delete a list doc (does not recursively delete items; do that with Admin/CF if needed) */
export async function deleteList(uid, listId) {
  await deleteDoc(doc(db, "users", uid, "wishlists", listId));
}

/** Add or merge an item under users/{uid}/wishlists/{listId}/items/{isbn} */
export async function addItem(uid, listId, book) {
  const itemRef = doc(db, "users", uid, "wishlists", listId, "items", book.isbn);
  await setDoc(
    itemRef,
    { ...book, addedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true }
  );
  await updateDoc(doc(db, "users", uid, "wishlists", listId), { updatedAt: serverTimestamp() });
}

/** Remove an item by ISBN */
export async function removeItem(uid, listId, isbn) {
  await deleteDoc(doc(db, "users", uid, "wishlists", listId, "items", isbn));
  await updateDoc(doc(db, "users", uid, "wishlists", listId), { updatedAt: serverTimestamp() });
}

/** Make a list public/private; when making public, creates/updates a mapping */
export async function togglePublic(uid, listId, on) {
  const listRef = doc(db, "users", uid, "wishlists", listId);
  let shareId = null;

  if (on) {
    shareId = makeShareId(10);
    await setDoc(listRef, { isPublic: true, shareId, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, "publicWishlists", shareId), { ownerUid: uid, listId, createdAt: serverTimestamp() });
  } else {
    // read current shareId to clean up mapping (optional)
    const snap = await getDoc(listRef);
    shareId = snap.exists() ? snap.data()?.shareId || null : null;
    await setDoc(listRef, { isPublic: false, shareId: null, updatedAt: serverTimestamp() }, { merge: true });
    // (optional) you could delete the mapping doc here, but keeping it is okay too
  }
  return shareId;
}

/** Resolve a public shareId → { ownerUid, listId } or null */
export async function getPublicMapping(shareId) {
  const snap = await getDoc(doc(db, "publicWishlists", shareId));
  return snap.exists() ? snap.data() : null;
}
