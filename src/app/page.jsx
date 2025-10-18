// src/app/page.jsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ensureAuth, db, auth } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { libroSearchUrl } from "@/lib/libro";
import { onAuthStateChanged } from "firebase/auth";

export default function Page() {
  const [uid, setUid] = useState(null);
  const [items, setItems] = useState([]);
  const [isAuthed, setIsAuthed] = useState(false);

  // ✅ Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setIsAuthed(!!u);
      if (u?.uid) setUid(u.uid);
    });
    return () => unsub();
  }, []);

  // ✅ Subscribe to wishlist once uid is known
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "wishlists", uid, "items"), orderBy("addedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => d.data())));
    return unsub;
  }, [uid]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Cozy & Content — My Wishlist</h1>

      {/* ✅ Show Login button if user isn't signed in */}
      {!isAuthed && (
        <div style={{ marginBottom: 12 }}>
          <a href="/account/login" className="cc-btn-outline">Log in</a>
          <a href="/account/signup" className="cc-btn-outline" style={{ marginLeft: 8 }}>Sign up</a>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, margin: "12px 0" }}>
        <Link href="/scan" style={{ textDecoration: "none" }}>
          <button>📷 Scan a Book</button>
        </Link>
      </div>

      {items.length === 0 ? (
        <p>No books yet. Tap <strong>Scan a Book</strong> to start your wishlist.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {items.map((it) => (
            <li key={it.isbn} style={{ display: "flex", gap: 12, padding: 12, borderBottom: "1px solid #eee" }}>
              {it.coverUrl && <img src={it.coverUrl} width={60} height={90} alt={it.title} />}
              <div>
                <div style={{ fontWeight: 700 }}>{it.title}</div>
                <div>{(it.authors || []).join(", ")}</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>ISBN: {it.isbn}</div>
                {libroSearchUrl && (
                  <div style={{ marginTop: 6 }}>
                    <a href={libroSearchUrl(it.title, (it.authors || [])[0])} target="_blank" rel="noreferrer">
                      🎧 Gift on Libro.fm
                    </a>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
