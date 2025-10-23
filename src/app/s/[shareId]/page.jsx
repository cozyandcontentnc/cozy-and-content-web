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
 * Helper: write to BOTH destinations used in your app:
 *   A) users/{viewerUid}/requests       (status: "new")
 *   B) users/{viewerUid}/bookRequests   (status: "requested")  <-- /requests page reads this
 * Returns { wroteRequests, wroteBookRequests, error? }
 */
async function addToRequestsBoth(viewerUid, payload) {
  let wroteRequests = false;
  let wroteBookRequests = false;
  let lastError = null;

  // A) generic "requests"
  try {
    const inbox = collection(db, "users", viewerUid, "requests");
    await addDoc(inbox, {
      ...payload,
      createdAt: serverTimestamp(),
      source: "share",
      status: "new",
      type: payload?.type || "book",
    });
    wroteRequests = true;
  } catch (e) {
    console.warn("[share] write to users/requests failed:", e?.code || e);
    lastError = e;
  }

  // B) bookRequests (the collection your Requests page subscribes to)
  try {
    const bookReqs = collection(db, "users", viewerUid, "bookRequests");
    await addDoc(bookReqs, {
      title: payload.title || "",
      author:
        payload.author ||
        (Array.isArray(payload.authors) ? payload.authors.join(", ") : ""),
      isbn: payload.isbn || "",
      image: payload.image || payload.coverUrl || "",
      fromShareId: payload.fromShareId || null,
      ownerUid: payload.ownerUid || null,
      listId: payload.listId || null,
      itemId: payload.itemId || null,
      status: "requested",
      type: payload?.type || "book",
      createdAt: serverTimestamp(),
    });
    wroteBookRequests = true;
  } catch (e) {
    console.warn("[share] write to users/bookRequests failed:", e?.code || e);
    lastError = e;
  }

  return { wroteRequests, wroteBookRequests, error: lastError || undefined };
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

          const result = await addToRequestsBoth(user.uid, {
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

          if (!result.wroteBookRequests) {
            console.warn("[share] Added locally / to users/requests, but bookRequests write failed.");
            setStatus("Saved, but not showing in Requests list. Check your console for details.");
            setTimeout(() => setStatus(""), 2000);
          }

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
                  const res = await addToRequestsBoth(viewerUid, {
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

                  if (res.error) {
                    setStatus("Could not save to Requests. See console.");
                    console.error(res.error);
                  } else if (!res.wroteBookRequests) {
                    setStatus("Saved, but not showing in Requests. See console.");
                  } else {
                    setStatus("Added to your Requests.");
                  }
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
