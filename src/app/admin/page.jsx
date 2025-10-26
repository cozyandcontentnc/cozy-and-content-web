// src/app/admin/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collectionGroup,
  onSnapshot,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [wishlists, setWishlists] = useState(null);
  const [status, setStatus] = useState("");

  // auth + admin check
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (!u) { setIsAdmin(false); return; }
      try {
        const snap = await getDoc(doc(db, "admins", u.uid));
        setIsAdmin(!!snap.exists());
      } catch {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  // subscribe to all wishlists (admins only)
  useEffect(() => {
    if (!isAdmin) return;
    // avoid orderBy to keep it index-free; you can add orderBy("updatedAt","desc") if you create an index
    const q = query(collectionGroup(db, "wishlists"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          // derive ownerUid from path: users/{ownerUid}/wishlists/{listId}
          const ownerUid = d.ref.parent.parent?.id || "unknown";
          return { id: d.id, ownerUid, path: d.ref.path, ...(d.data() || {}) };
        });
        setWishlists(rows);
        // ✅ clear any previous error message once we have data
        setStatus("");
      },
      (err) => {
        console.error("admin wishlists snapshot error:", err);
        setStatus("Could not load wishlists.");
      }
    );
    return () => unsub();
  }, [isAdmin]);

  if (!user) {
    return (
      <main style={container}>
        <h1>Admin</h1>
        <div className="cc-card">Please sign in as an admin to view this page.</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main style={container}>
        <h1>Admin</h1>
        <div className="cc-card">You are signed in as {user.email}, but you are not an admin.</div>
      </main>
    );
  }

  return (
    <main style={container}>
      <div style={headerRow}>
        <Link href="/" className="cc-btn-outline">← Home</Link>
        <h1 style={{ margin: 0 }}>Admin</h1>
      </div>

      {status && <div className="cc-card" style={{ marginBottom: 12 }}>{status}</div>}

      <section>
        <h2 style={{ margin: "8px 0 12px" }}>All wishlists</h2>

        {!wishlists ? (
          <div className="cc-card">Loading…</div>
        ) : wishlists.length === 0 ? (
          <div className="cc-card">No wishlists found.</div>
        ) : (
          <div style={gridWrap}>
            {wishlists.map((wl) => (
              <article key={wl.path} className="cc-card" style={card}>
                <div style={cardTop}>
                  <div style={{ minWidth: 0 }}>
                    <div style={title}>{wl.name || "Wishlist"}</div>
                    <div style={meta}>Owner UID: <code style={code}>{wl.ownerUid}</code></div>
                    {wl.shareId && (
                      <div style={meta}>Share: <code style={code}>{wl.shareId}</code></div>
                    )}
                    <div style={metaSmall}>
                      Path: <code style={pathCode} title={wl.path}>{wl.path}</code>
                    </div>
                  </div>

                  <div style={actions}>
                    <Link href={`/list/${wl.id}`} className="cc-btn-outline">Open (owner view)</Link>
                    {wl.shareId ? (
                      <Link href={`/s/${wl.shareId}`} className="cc-btn-outline">Open share</Link>
                    ) : (
                      <span className="cc-btn-outline" style={{ opacity: 0.6, cursor: "not-allowed" }}>No share</span>
                    )}
                  </div>
                </div>

                <AdminWishlistItems ownerUid={wl.ownerUid} listId={wl.id} />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/* --------- Items subcomponent ---------- */
function AdminWishlistItems({ ownerUid, listId }) {
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!ownerUid || !listId) return;
    const q = query(collection(db, "users", ownerUid, "wishlists", listId, "items"), orderBy("addedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
        setMsg("");
      },
      (e) => {
        console.error(e);
        setMsg("Could not load items.");
      }
    );
    return () => unsub();
  }, [ownerUid, listId]);

  async function onDelete(itemId) {
    if (!confirm("Remove this item from the wishlist?")) return;
    try {
      await deleteDoc(doc(db, "users", ownerUid, "wishlists", listId, "items", itemId));
      setMsg("Item removed.");
      setTimeout(() => setMsg(""), 1200);
    } catch (e) {
      console.error(e);
      setMsg("Could not remove item.");
    }
  }

  if (!items) return <div style={{ paddingTop: 8 }}>Loading items…</div>;
  if (items.length === 0) return <div style={{ paddingTop: 8, color: "#666" }}>No items.</div>;

  return (
    <>
      <ul style={itemList}>
        {items.map((it) => (
          <li key={it.id} style={itemRow} className="cc-card">
            <div style={{ minWidth: 0 }}>
              <div style={itemTitle}>{it.title || "Untitled"}</div>
              {it.author && <div style={itemMeta}>{it.author}</div>}
              {it.isbn && <div style={itemMetaSmall}>ISBN: {it.isbn}</div>}
            </div>
            <div style={itemActions}>
              <button className="cc-btn-outline" onClick={() => onDelete(it.id)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {msg && <div style={{ marginTop: 6, fontSize: 13 }}>{msg}</div>}
    </>
  );
}

/* --------- styles --------- */
const container = {
  padding: 16,
  fontFamily: "system-ui",
  maxWidth: 1100,
  margin: "0 auto",
};

const headerRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
};

const gridWrap = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: 12,
};

const card = {
  display: "grid",
  gap: 10,
  overflow: "hidden",
};

const cardTop = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 12,
  alignItems: "start",
  minWidth: 0,
};

const title = { fontWeight: 800, fontSize: 16, marginBottom: 2 };
const meta  = { color: "#555", fontSize: 13, marginTop: 2 };
const metaSmall = { color: "#777", fontSize: 12, marginTop: 2 };
const code = { fontFamily: "monospace", fontSize: 12, background: "#f7f5f1", padding: "1px 4px", borderRadius: 4 };
const pathCode = { ...code, display: "inline-block", maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" };

const actions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",         // ✅ buttons wrap instead of pushing card wide
  justifyContent: "flex-end",
};

const itemList = { listStyle: "none", padding: 0, display: "grid", gap: 8 };
const itemRow  = { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" };
const itemTitle = { fontWeight: 700 };
const itemMeta  = { color: "#666", fontSize: 13 };
const itemMetaSmall = { color: "#777", fontSize: 12 };
const itemActions = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
