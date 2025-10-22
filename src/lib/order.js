// src/lib/order.js
"use client";

import { db, ensureAuth } from "@/lib/firebase";
import {
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";

const KEY = "cc_order_v1";

/* ---------------------------
   Local (existing behavior)
----------------------------*/
export function getOrder() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

export function saveOrder(items) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
}

/**
 * Add one item locally AND (if possible) to Firestore:
 * item: {title, author, isbn, image, fromShareId, ownerUid, listId, itemId}
 * - Writes to BOTH:
 *   A) users/{uid}/requests          (status "new")
 *   B) users/{uid}/bookRequests      (status "requested")  <-- your /requests page reads this
 */
export async function addToOrder(item) {
  const now = Date.now();

  // 1) Local (unchanged)
  const current = getOrder();
  const exists = current.find(
    (i) => i.itemId === item.itemId && i.fromShareId === item.fromShareId
  );
  if (!exists) current.unshift({ ...item, addedAt: now, purchased: false });
  saveOrder(current);

  // 2) Firestore (best-effort): write to *both* paths
  try {
    const user = await ensureAuth({ allowAnonymous: true });
    if (user?.uid) {
      // A) Generic requests collection
      const reqCol = collection(db, "users", user.uid, "requests");
      await addDoc(reqCol, {
        ...item,
        type: "book",
        status: "new",
        createdAt: serverTimestamp(),
        fromShareId: item.fromShareId || null,
      });

      // B) Book requests collection (your /requests page subscribes here)
      const bookReqs = collection(db, "users", user.uid, "bookRequests");
      await addDoc(bookReqs, {
        title: item.title || "",
        author:
          item.author ||
          (Array.isArray(item.authors) ? item.authors.join(", ") : ""),
        isbn: item.isbn || "",
        image: item.image || "",
        fromShareId: item.fromShareId || null,
        ownerUid: item.ownerUid || null,
        listId: item.listId || null,
        itemId: item.itemId || null,
        status: "requested",
        type: "book",
        createdAt: serverTimestamp(),
      });
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[order] Firestore write skipped:", e?.code || e);
    }
  }

  return current;
}

export function removeFromOrder(index) {
  const current = getOrder();
  current.splice(index, 1);
  saveOrder(current);
  return current;
}

export function clearOrder() {
  saveOrder([]);
}

/**
 * Build mailto for current local items
 */
export function buildMailto({ name, email, items }) {
  const to = "cozyandcontentbooks@gmail.com";
  const subject = encodeURIComponent("Wishlist Order Request");
  const lines = [];
  lines.push(`Name: ${name || ""}`);
  lines.push(`Email: ${email || ""}`);
  lines.push("");
  lines.push("I'd like to order the following titles:");
  lines.push("");
  items.forEach((b, idx) => {
    lines.push(
      `${idx + 1}. ${b.title}${b.author ? " — " + b.author : ""}${
        b.isbn ? " (ISBN: " + b.isbn + ")" : ""
      }`
    );
  });
  lines.push("");
  lines.push("Notes:");
  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

/* ---------------------------
   Optional Firestore helpers
----------------------------*/

/** Live subscription to my Firestore requests (most recent first). */
export async function subscribeMyRequests(cb) {
  const user = await ensureAuth({ allowAnonymous: true });
  if (!user?.uid) throw new Error("No session");
  const qRef = query(
    collection(db, "users", user.uid, "requests"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(qRef, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
  });
}

/** Mark a request status (e.g., 'new' | 'emailed' | 'ordered' | 'done'). */
export async function setRequestStatus(reqId, status) {
  const user = await ensureAuth({ allowAnonymous: true });
  if (!user?.uid) throw new Error("No session");
  await updateDoc(doc(db, "users", user.uid, "requests", reqId), { status });
}

/** Delete a Firestore request. */
export async function deleteRequest(reqId) {
  const user = await ensureAuth({ allowAnonymous: true });
  if (!user?.uid) throw new Error("No session");
  await deleteDoc(doc(db, "users", user.uid, "requests", reqId));
}
