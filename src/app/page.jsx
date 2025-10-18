// src/app/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

export default function HomePage() {
  const [uid, setUid] = useState(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setIsAuthed(!!u);
      setUid(u?.uid || null);
    });
    return () => unsub();
  }, []);

  // If your current data is still the old flat path wishlists/{uid}/items
  // keep this; if you’ve migrated to per-list items, point this at a list route.
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "wishlists", uid, "items"), orderBy("addedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => d.data())));
    return unsub;
  }, [uid]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Cozy & Content — My Wishlist</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/scan" className="cc-btn" style={{ textDecoration: "none" }}>📷 Scan a Book</Link>
          {!isAuthed && (
            <>
              <a href="/account/login" className="cc-btn-outline">Log in</a>
              <a href="/account/signup" className="cc-btn-outline">Sign up</a>
            </>
          )}
        </div>
      </header>

      {uid && items.length === 0 && (
        <div className="cc-card">No books yet. Tap <strong>Scan a Book</strong> to add your first one.</div>
      )}

      {uid && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {items.map((it) => (
            <li key={it.isbn} className="cc-card" style={{ display: "flex", gap: 12 }}>
              {it.coverUrl && <img src={it.coverUrl} width={60} height={90} alt={it.title} />}
              <div>
                <div style={{ fontWeight: 700 }}>{it.title}</div>
                <div>{Array.isArray(it.authors) ? it.authors.join(", ") : it.author}</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>ISBN: {it.isbn}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!uid && (
        <div className="cc-card">You’re not signed in. Log in to view and save your wishlist.</div>
      )}
    </main>
  );
}
