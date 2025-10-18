// lib/wishlists.js
"use client";

import { db } from "./db";
import {
  addDoc, collection, serverTimestamp, updateDoc, doc, deleteDoc, setDoc, getDoc,
} from "firebase/firestore";

/** Small helper to create a short random shareId without new deps */
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

/** Create a new wishlist under users/{uid}/wishlists */
export async function createList(uid, name) {
  const ref = await addDoc(collection(db, "users", uid, "wishlists"), {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isPublic: false,
    shareId: null,
  });
  return ref.id;
}

export async function renameList(uid, listId, name) {
  await updateDoc(doc(db, "users", uid, "wishlists", listId), {
    name,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteList(uid, listId) {
  await deleteDoc(doc(db, "users", uid, "wishlists", listId));
}

/** Add an item under users/{uid}/wishlists/{listId}/items */
export async function addItem(uid, listId, item) {
  await addDoc(collection(db, "users", uid, "wishlists", listId, "items"), {
    ...item,
    qty: item.qty ?? 1,
    addedAt: serverTimestamp(),
  });
}

/** Toggle public sharing; creates publicWishlists/{shareId} mapping */
export async function togglePublic(uid, listId, on) {
  const shareId = on ? makeShareId(10) : null;
  await updateDoc(doc(db, "users", uid, "wishlists", listId), {
    isPublic: on,
    shareId,
    updatedAt: serverTimestamp(),
  });
  if (on && shareId) {
    await setDoc(doc(db, "publicWishlists", shareId), {
      ownerUid: uid,
      listId,
      createdAt: serverTimestamp(),
    });
  }
  return shareId;
}

/** Resolve public shareId -> { ownerUid, listId } */
export async function getPublicMapping(shareId) {
  const snap = await getDoc(doc(db, "publicWishlists", shareId));
  return snap.exists() ? snap.data() : null;
}
