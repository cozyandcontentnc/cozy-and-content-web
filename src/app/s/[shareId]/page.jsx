// src/app/s/[shareId]/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { db, ensureAuth } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";

/**
 * Helper: add a single item into the viewer's Requests inbox
 * (Keeps this page self-contained even if your addToOrder() helper changes)
 */
async function addToRequests(viewerUid, payload) {
  const inbox = collection(db, "users", viewerUid, "requests");
  await addDoc(inbox, {
    ...payload,
    createdAt: serverTimestamp(),
    source: "share",
    status: "new",
  });
}

export default function PublicSharePage() {
  const { shareId } = useParams();                   // /s/:shareId
  const search = useSearchParams();
  const focusItem = search.get("item");              // optional ?item=abc
  const router = useRouter();

  const [viewerUid, setViewerUid] = useState(null);
  const [mapping, setMapping] = useState(null);      // { ownerUid, listId, listName? }
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState("Loading…");

  const focusedIndex = useMemo(() => {
    if (!items || !focusItem) return -1;
    return items.findIndex((b) => b.id === focusItem);
  }, [items, focusItem]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 1) Ensure we have a session (anonymous is fine)
        const user = await ensureAuth({ allowAnonymous: true });
        if (!user?.uid) {
          if (alive) setStatus("Could not open a session to save your request.");
          return;
        }
        if (alive) setViewerUid(user.uid);

        // 2) Resolve mapping document: shares/{shareId}
        const sref = doc(db, "shares", shareId);
        const ssnap = await getDoc(sref);
        if (!ssnap.exists()) {
          if (alive) setStatus("This share link is no longer available.");
          return;
        }
        const map = { id: ssnap.id, ...(ssnap.data() || {}) };
        if (alive) setMapping(map);

        // 3) Try denormalized public items first: shares/{shareId}/items
        let loaded = [];
        try {
          const pubQ = query(
            collection(db, "shares", shareId, "items"),
            orderBy("addedAt", "desc")
          );
          const pubSnap = await getDocs(pubQ);
          loaded = pubSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        } catch {
          // ignore; we’ll fall back below
        }

        // 4) Fallback to owner path if public items aren't present
        if (!loaded.length && map.ownerUid && map.listId) {
          try {
            const ownerQ = query(
              collection(db, "users", map.ownerUid, "wishlists", map.listId, "items"),
              orderBy("addedAt", "desc")
            );
            const ownerSnap = await getDocs(ownerQ); // may fail if rules block it
            loaded = ownerSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          } catch (e) {
            // Cross-user read blocked — still usable for single-item add by id.
            // We’ll show a light UI and let ?item= flow proceed with minimal fields.
          }
        }

        if (alive) {
          setItems(loaded);
          setStatus("");
        }

        // 5) If this is a single-book link, auto-add & redirect
        if (focusItem && alive) {
          const found =
            loaded.find((b) => b.id === focusItem) ||
            // minimal stub if we couldn’t read details
            { id: focusItem, title: "", author: "", isbn: "", image: "" };

          await addToRequests(user.uid, {
            type: "book",
            fromShareId: shareId,
            ownerUid: map.ownerUid,
            listId: map.listId,
            itemId: found.id,
            title: found.title || "",
            author:
              found.author ||
              (Array.isArray(found.authors) ? found.authors.join(", ") : ""),
            isbn: found.isbn || "",
            image: found.image || found.coverUrl || "",
          });

          router.replace("/requests");
        }
      } catch (e) {
        console.error(e);
        if (alive) setStatus("We couldn’t open that share. Please try again.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [shareId, focusItem, router]);

  if (!items) {
    return (
      <main style={{ padding: 20, fontFamily: "system-ui" }}>
        {status || "Loading…"}
      </main>
    );
  }

  // Full list view (no ?item=...)
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 12, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
        {mapping?.listName || "Shared Wishlist"}
      </h1>
      {status && <div className="cc-card" style={{ marginBottom: 12 }}>{status}</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {items.map((b, i) => (
          <div
            key={b.id}
            className="cc-card"
            style={{
              display: "grid",
              gap: 6,
              outline: i === focusedIndex ? "2px solid var(--cc-accent)" : "none",
            }}
          >
            <div style={{ fontWeight: 700 }}>{b.title || "Untitled"}</div>
            {(b.author || b.authors) && (
              <div style={{ opacity: 0.8 }}>
                {b.author || (Array.isArray(b.authors) ? b.authors.join(", ") : "")}
              </div>
            )}
            {b.isbn && (
              <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                ISBN: {b.isbn}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <button
                className="cc-btn"
                onClick={async () => {
                  if (!viewerUid) return;
                  await addToRequests(viewerUid, {
                    type: "book",
                    fromShareId: shareId,
                    ownerUid: mapping?.ownerUid,
                    listId: mapping?.listId,
                    itemId: b.id,
                    title: b.title || "",
                    author:
                      b.author ||
                      (Array.isArray(b.authors) ? b.authors.join(", ") : ""),
                    isbn: b.isbn || "",
                    image: b.image || b.coverUrl || "",
                  });
                  setStatus("Added to your Requests.");
                  setTimeout(() => setStatus(""), 1500);
                }}
              >
                + Add to my order
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
