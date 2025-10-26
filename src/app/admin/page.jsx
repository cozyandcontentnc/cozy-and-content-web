// src/app/admin/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db, ensureAuth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collectionGroup,
  query,
  where,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  collection,
  getDocs,
} from "firebase/firestore";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [wishlists, setWishlists] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setIsAdmin(false);
        return;
      }
      setUser(u);

      // check admins/{uid} existence
      try {
        const adminDoc = await getDocs(collection(db, `admins`)); // cheap check alternative below
      } catch (e) {
        // ignore
      }

      // Client-side check: read admin doc
      const adminRef = doc(db, "admins", u.uid);
      const adminSnap = await adminRef.get?.() // some SDKs...
        .catch(() => null);

      // safer: fetch using getDoc (import getDoc if needed)
      // but because we can't import getDoc inside anonymous snippet, do a firestore get:
      try {
        const { getDoc } = await import("firebase/firestore");
        const snap = await getDoc(adminRef);
        setIsAdmin(!!snap.exists());
      } catch (e) {
        console.error("admin check failed", e);
        setIsAdmin(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // Subscribe to all wishlists (collectionGroup) — only allowed if admin per rules
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collectionGroup(db, "wishlists"));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, path: d.ref.path, ...d.data() }));
      setWishlists(rows);
    }, (err) => {
      console.error("admin wishes snapshot err", err);
      setStatus("Could not load wishlists.");
    });
    return () => unsub();
  }, [isAdmin]);

  if (user && !isAdmin) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
        <h1>Admin</h1>
        <div className="cc-card">You are signed in as {user.email} but you are not an admin.</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
        <h1>Admin</h1>
        <div className="cc-card">Please sign in as an admin to view this page.</div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <Link href="/" className="cc-btn-outline">← Home</Link>
        <h1 style={{ margin: 0 }}>Admin</h1>
      </div>

      {status && <div className="cc-card" style={{ marginBottom: 12 }}>{status}</div>}

      <section style={{ marginBottom: 20 }}>
        <h2>All wishlists</h2>
        <p style={{ color: "#666" }}>As admin you can edit or remove items from any wishlist.</p>
        {!wishlists ? (
          <div className="cc-card">Loading…</div>
        ) : wishlists.length === 0 ? (
          <div className="cc-card">No wishlists found.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {wishlists.map((wl) => (
              <div key={wl.path} className="cc-card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{wl.name || "Wishlist"}</div>
                    <div style={{ color: "#666", fontSize: 13 }}>Owner: {wl.ownerUid}</div>
                    <div style={{ color: "#666", fontSize: 13 }}>Path: {wl.path}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link href={`/list/${wl.id}`} className="cc-btn-outline">Open as owner</Link>
                    <Link href={`/s/${wl.shareId || ""}`} className="cc-btn-outline">Open share</Link>
                  </div>
                </div>

                {/* Expand items on demand (fetch items under this wishlist) */}
                <AdminWishlistItems ownerUid={wl.ownerUid} listId={wl.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/* Subcomponent that fetches items for a given owner/list and allows deletion */
function AdminWishlistItems({ ownerUid, listId }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!ownerUid || !listId) return;
    let unsub = null;
    (async () => {
      setLoading(true);
      try {
        const { query, collection, orderBy, onSnapshot } = await import("firebase/firestore");
        const q = query(collection(db, "users", ownerUid, "wishlists", listId, "items"), orderBy("addedAt", "desc"));
        unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
      } catch (e) {
        console.error("failed loading items", e);
        setStatus("Could not load items.");
      } finally {
        setLoading(false);
      }
    })();
    return () => { if (unsub) unsub(); };
  }, [ownerUid, listId]);

  async function onDeleteItem(itemId) {
    if (!confirm("Remove this item from the wishlist?")) return;
    try {
      await deleteDoc(doc(db, "users", ownerUid, "wishlists", listId, "items", itemId));
      setStatus("Item removed.");
      setTimeout(() => setStatus(""), 1500);
    } catch (e) {
      console.error(e);
      setStatus("Could not remove item.");
    }
  }

  if (loading) return <div>Loading items…</div>;
  if (!items) return null;
  if (items.length === 0) return <div style={{ marginTop: 8 }}>No items</div>;

  return (
    <div style={{ marginTop: 12 }}>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {items.map((it) => (
          <li key={it.id} className="cc-card" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{it.title}</div>
              <div style={{ color: "#666", fontSize: 13 }}>{it.author}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="cc-btn-outline" onClick={() => onDeleteItem(it.id)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {status && <div style={{ marginTop: 8 }}>{status}</div>}
    </div>
  );
}
