// src/lib/wishlists.js
import { db } from "./firebase";
import {
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  collection,
} from "firebase/firestore";

/**
 * Ensure a list exists, returning its ID. (If id provided, it’s returned.)
 */
export async function createList(uid, name = "New List", idMaybe) {
  const id = idMaybe || crypto.randomUUID();
  const ref = doc(db, "users", uid, "wishlists", id);
  const snap = await getDoc(ref);
  const base = {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isPublic: false,
    shareId: null,
  };
  if (snap.exists()) {
    // Only touch updatedAt if it exists
    await updateDoc(ref, { updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, base, { merge: true });
  }
  return id;
}

/**
 * Add (or merge) an item under users/{uid}/wishlists/{listId}/items/{isbn}
 * Book: { isbn, title, author, image }
 */
export async function addItem(uid, listId, book) {
  const itemRef = doc(db, "users", uid, "wishlists", listId, "items", book.isbn);
  await setDoc(
    itemRef,
    {
      ...book,
      addedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  // bump list updatedAt
  const listRef = doc(db, "users", uid, "wishlists", listId);
  await updateDoc(listRef, { updatedAt: serverTimestamp() });
}

/**
 * Remove an item. Also bumps list updatedAt.
 */
export async function removeItem(uid, listId, isbn) {
  const itemRef = doc(db, "users", uid, "wishlists", listId, "items", isbn);
  await deleteDoc(itemRef);
  const listRef = doc(db, "users", uid, "wishlists", listId);
  await updateDoc(listRef, { updatedAt: serverTimestamp() });
}

/**
 * (Optional) rename list
 */
export async function renameList(uid, listId, newName) {
  const listRef = doc(db, "users", uid, "wishlists", listId);
  await updateDoc(listRef, { name: newName, updatedAt: serverTimestamp() });
}

/**
 * (Optional) delete list and its items (client-side recursive delete not included here).
 * If you need full recursive delete, do it via a Cloud Function or Admin SDK.
 */
export async function deleteList(uid, listId) {
  const listRef = doc(db, "users", uid, "wishlists", listId);
  await deleteDoc(listRef);
}

/**
 * (Optional) path helper for items collection
 */
export function itemsCollectionPath(uid, listId) {
  return collection(db, "users", uid, "wishlists", listId, "items");
}
