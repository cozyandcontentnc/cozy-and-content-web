// src/lib/wishlists.js
"use client";

import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  startAfter,
  limit,
} from "firebase/firestore";

/* ===================================================================
   READ: public mapping for a shareId
   shares/{shareId} => { ownerUid, listId, listName? }
   =================================================================== */
export async function getPublicMapping(shareId) {
  const sref = doc(db, "shares", shareId);
  const snap = await getDoc(sref);
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  return {
    shareId: snap.id,
    ownerUid: d.ownerUid,
    listId: d.listId,
    listName: d.listName || "Wishlist",
  };
}

/* ===================================================================
   UPDATE: rename a list
   users/{uid}/wishlists/{listId}
   =================================================================== */
export async function renameList(uid, listId, newName) {
  const ref = doc(db, "users", uid, "wishlists", listId);
  await updateDoc(ref, { name: newName, updatedAt: serverTimestamp() });
  // keep share doc in sync if it exists
  const listSnap = await getDoc(ref);
  const shareId = listSnap.data()?.shareId;
  if (shareId) {
    await setDoc(
      doc(db, "shares", shareId),
      { listName: newName, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
}

/* ===================================================================
   DELETE: remove one item from a list
   users/{uid}/wishlists/{listId}/items/{itemId}
   Also remove mirrored public item if list is public.
   =================================================================== */
export async function removeItemById(uid, listId, itemId) {
  const listRef = doc(db, "users", uid, "wishlists", listId);
  const listSnap = await getDoc(listRef);
  const shareId = listSnap.data()?.shareId || null;

  const batch = writeBatch(db);
  batch.delete(doc(db, "users", uid, "wishlists", listId, "items", itemId));
  if (shareId) {
    batch.delete(doc(db, "shares", shareId, "items", itemId));
    batch.set(
      doc(db, "shares", shareId),
      { updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  await batch.commit();
}

/* ===================================================================
   TOGGLE PUBLIC:
   - next === true  -> make public: ensure share doc + mirror items to shares/{shareId}/items
   - next === false -> make private: delete shares subtree and unset flags
   Returns shareId (when enabling).
   =================================================================== */
export async function togglePublic(uid, listId, next) {
  const listRef = doc(db, "users", uid, "wishlists", listId);
  const listSnap = await getDoc(listRef);
  if (!listSnap.exists()) throw new Error("List not found.");

  const list = listSnap.data() || {};
  const currentShareId = list.shareId || null;

  if (next) {
    // ---- ENABLE PUBLIC ----
    const shareId = currentShareId || doc(collection(db, "shares")).id;

    // 1) upsert share doc
    await setDoc(
      doc(db, "shares", shareId),
      {
        ownerUid: uid,
        listId,
        listName: list.name || "Wishlist",
        createdAt: currentShareId ? (list.createdAt || serverTimestamp()) : serverTimestamp(),
        updatedAt: serverTimestamp(),
        v: 1,
      },
      { merge: true }
    );

    // 2) mirror items into shares/{shareId}/items in batches
    await mirrorListItemsToShare(uid, listId, shareId);

    // 3) update list flags
    await updateDoc(listRef, {
      isPublic: true,
      shareId,
      updatedAt: serverTimestamp(),
    });

    return shareId;
  } else {
    // ---- DISABLE PUBLIC ----
    const shareId = currentShareId;
    if (shareId) {
      await deleteShareTree(shareId);
    }
    await updateDoc(listRef, {
      isPublic: false,
      shareId: null,
      updatedAt: serverTimestamp(),
    });
    return null;
  }
}

/* ===================================================================
   INTERNAL: mirror all items to shares/{shareId}/items
   - paginated to avoid huge writes
   - batches of up to ~400 ops per commit (under 500 limit)
   Fields mirrored: id, title, author/authors, isbn, image, coverUrl, thumbnail, addedAt
   =================================================================== */
async function mirrorListItemsToShare(uid, listId, shareId) {
  const srcCol = collection(db, "users", uid, "wishlists", listId, "items");
  let last = null;

  while (true) {
    const pageQ = last
      ? query(srcCol, orderBy("addedAt", "desc"), startAfter(last), limit(400))
      : query(srcCol, orderBy("addedAt", "desc"), limit(400));

    const snap = await getDocs(pageQ);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.forEach((d) => {
      const it = d.data() || {};
      const authorsArr = Array.isArray(it.authors)
        ? it.authors
        : it.author
        ? [it.author]
        : [];
      const pubDoc = doc(db, "shares", shareId, "items", d.id);
      batch.set(
        pubDoc,
        {
          title: it.title || "",
          author: it.author || (authorsArr.length ? authorsArr.join(", ") : ""),
          authors: authorsArr,
          isbn: it.isbn || "",
          image: it.image || it.coverUrl || it.thumbnail || "",
          coverUrl: it.coverUrl || it.image || it.thumbnail || "",
          thumbnail: it.thumbnail || it.coverUrl || it.image || "",
          addedAt: it.addedAt || serverTimestamp(),
        },
        { merge: true }
      );
    });

    // bump parent share updatedAt
    batch.set(
      doc(db, "shares", shareId),
      { updatedAt: serverTimestamp() },
      { merge: true }
    );

    await batch.commit();
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }
}

/* ===================================================================
   INTERNAL: delete shares/{shareId}/items/* then the share doc
   =================================================================== */
async function deleteShareTree(shareId) {
  const itemsCol = collection(db, "shares", shareId, "items");
  while (true) {
    const page = await getDocs(query(itemsCol, limit(400)));
    if (page.empty) break;
    const batch = writeBatch(db);
    page.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < 400) break;
  }
  await deleteDoc(doc(db, "shares", shareId));
}

/* ===================================================================
   (Optional) create a list – included for completeness
   =================================================================== */
export async function createList(uid, name) {
  const ref = await addDoc(collection(db, "users", uid, "wishlists"), {
    name: name || "Wishlist",
    isPublic: false,
    shareId: null,
    itemCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/* ===================================================================
   REPAIR: ensure shares/{shareId} + shares/{shareId}/items for a single list
   - Reuses existing shareId if present; otherwise generates one.
   =================================================================== */
export async function ensureShareForList(uid, listId) {
  const listRef = doc(db, "users", uid, "wishlists", listId);
  const listSnap = await getDoc(listRef);
  if (!listSnap.exists()) throw new Error("List not found");
  const list = listSnap.data() || {};
  if (!list.isPublic && !list.shareId) throw new Error("List is not public");

  const shareId = list.shareId || doc(collection(db, "shares")).id;

  // Upsert parent share doc
  await setDoc(
    doc(db, "shares", shareId),
    {
      ownerUid: uid,
      listId,
      listName: list.name || "Wishlist",
      createdAt: list.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      v: 1,
    },
    { merge: true }
  );

  // Mirror items (with coverUrl/thumbnail)
  await mirrorListItemsToShare(uid, listId, shareId);

  // Ensure list flags
  await updateDoc(listRef, { isPublic: true, shareId, updatedAt: serverTimestamp() });

  return shareId;
}

/* ===================================================================
   BACKFILL: ensure shares for all currently public lists (run once)
   =================================================================== */
export async function backfillAllPublicShares(uid) {
  const listsCol = collection(db, "users", uid, "wishlists");
  const snap = await getDocs(listsCol);
  const results = [];
  for (const d of snap.docs) {
    const data = d.data() || {};
    if (data.isPublic) {
      const shareId = await ensureShareForList(uid, d.id);
      results.push({ listId: d.id, shareId });
    }
  }
  return results;
}
