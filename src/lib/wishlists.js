// src/lib/wishlists.js
import { db } from "./firebase";
import {
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
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

/** Create a list and return its id (idempotent-ish) */
export async function createList(uid, name = "New List", idMaybe) {
  const id = idMaybe || crypto.randomUUID?.() || Math.random().toString(36).slice(2);
  const ref = doc(db, "users", uid, "wishlists", id);
  await setDoc(ref, {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isPublic: false,
    shareId: null,
  }, { merge: true });
  return id;
}

export async function renameList(uid, listId, newName) {
  await updateDoc(doc(db, "users", uid, "wishlists", listId), {
    name: newName,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteList(uid, listId) {
  await deleteDoc(doc(db, "users", uid, "wishlists", listId));
}

/** Upsert item at key = book.isbn (if you want a different key, pass it as id) */
export async function addItem(uid, listId, book, idMaybe) {
  const itemId = idMaybe || String(book.isbn || crypto.randomUUID?.() || Math.random().toString(36).slice(2));
  const itemRef = doc(db, "users", uid, "wishlists", listId, "items", itemId);
  await setDoc(itemRef, {
    ...book,
    addedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // bump list updatedAt
  await updateDoc(doc(db, "users", uid, "wishlists", listId), { updatedAt: serverTimestamp() });
}

/** Delete by *document id* (reliable). */
export async function removeItemById(uid, listId, itemId) {
  await deleteDoc(doc(db, "users", uid, "wishlists", listId, "items", itemId));
  await updateDoc(doc(db, "users", uid, "wishlists", listId), { updatedAt: serverTimestamp() });
}

/** Back-compat: delete by isbn or id (just forwards to removeItemById). */
export async function removeItem(uid, listId, isbnOrId) {
  return removeItemById(uid, listId, String(isbnOrId));
}

/** Toggle public share and return shareId (or null if made private) */
export async function togglePublic(uid, listId, on) {
  const listRef = doc(db, "users", uid, "wishlists", listId);
  let shareId = null;

  if (on) {
    shareId = makeShareId(10);
    await setDoc(listRef, { isPublic: true, shareId, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, "publicWishlists", shareId), { ownerUid: uid, listId, createdAt: serverTimestamp() });
  } else {
    const snap = await getDoc(listRef);
    shareId = snap.exists() ? snap.data()?.shareId || null : null;
    await setDoc(listRef, { isPublic: false, shareId: null, updatedAt: serverTimestamp() }, { merge: true });
    // (optional) delete the mapping doc here if you want to revoke the old shareId
  }
  return shareId;
}

/** Resolve shareId → { ownerUid, listId } */
export async function getPublicMapping(shareId) {
  const snap = await getDoc(doc(db, "publicWishlists", shareId));
  return snap.exists() ? snap.data() : null;
}
