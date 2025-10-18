"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ensureAuth, db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { libroSearchUrl } from "@/lib/libro";
// Optional: if you have createList helper already
// import { createList } from "@/lib/wishlists";

const LOGO_W = 220; // 👈 change these to resize your logo
const LOGO_H = 120;  // keep the aspect ratio visually consistent

export default function Page() {
  const [uid, setUid] = useState(null);

  // Legacy single-list items (your current path: wishlists/{uid}/items)
  const [items, setItems] = useState([]);

  // Optional multi-list support (users/{uid}/wishlists) — will show if present
  const [lists, setLists] = useState([]);

  // ensure auth, then store uid
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth();
      if (active) setUid(user?.uid || null);
    })();
    return () => { active = false; };
  }, []);

  // Subscribe to legacy single-list items
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "wishlists", uid, "items"),
      orderBy("addedAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => d.data())));
    return unsub;
  }, [uid]);

  // Subscribe to multi-list collection if you’re using users/{uid}/wishlists
  useEffect(() => {
    if (!uid) return;
    const qRef = query(
      collection(db, "users", uid, "wishlists"),
      orderBy("updatedAt", "desc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data()) }));
        setLists(rows);
      },
      // If this path isn't used in your project, ignore errors silently
      () => setLists([])
    );
    return unsub;
  }, [uid]);

  // Optional: create a new list and jump to it (uncomment if you have createList)
/*
  const [busy, setBusy] = useState(false);
  async function onCreateList() {
    if (!uid || busy) return;
    const name = prompt("Name your new list:", `Visit — ${new Date().toLocaleDateString()}`);
    if (!name?.trim()) return;
    try {
      setBusy(true);
      const id = await createList(uid, name.trim());
      location.href = `/list/${id}`;
    } finally {
      setBusy(false);
    }
  }
*/

  const hasLists = lists && lists.length > 0;

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui",
        textAlign: "center",
        background: "#faf7f2",
        minHeight: "100vh",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 20 }}>
        <Image
          src="/images/logo.png"            // must live at public/images/logo.png
          alt="Cozy & Content"
          width={LOGO_W}
          height={LOGO_H}
          priority
          style={{ display: "block", margin: "0 auto" }}
        />
      </div>

      {/* Friendly hero */}
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 800,
          margin: "0 0 8px",
          color: "#2a2a2a",
        }}
      >
        Welcome to Cozy & Content!
      </h1>
      <p
        style={{
          fontSize: "1.05rem",
          color: "#555",
          margin: "0 auto 24px",
          maxWidth: 520,
        }}
      >
        Scan books, build wishlists, and share requests.
      </p>

      {/* Primary actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 28,
        }}
      >
        <Link href="/scan" style={{ textDecoration: "none" }}>
          <button
            style={{
              padding: "12px 18px",
              fontSize: 16,
              backgroundColor: "#365c4a",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            📷 Scan a Book
          </button>
        </Link>

        <Link href="/requests" style={{ textDecoration: "none" }}>
          <button
            style={{
              padding: "12px 18px",
              fontSize: 16,
              backgroundColor: "#cfac78",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            📨 Requests
          </button>
        </Link>

        <Link href="/lists" style={{ textDecoration: "none" }}>
          <button
            style={{
              padding: "12px 18px",
              fontSize: 16,
              backgroundColor: "#fff",
              color: "#365c4a",
              border: "2px solid #365c4a",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            🗂️ All Wishlists
          </button>
        </Link>

        {/* If you prefer a one-click create button, uncomment and use createList above */}
        {/*
        <button
          onClick={onCreateList}
          disabled={busy}
          style={{
            padding: "12px 18px",
            fontSize: 16,
            backgroundColor: "#fff",
            color: "#365c4a",
            border: "2px solid #365c4a",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          ➕ New List
        </button>
        */}
      </div>

      {/* Optional: My Wishlists (shows only if users/{uid}/wishlists exists) */}
      {hasLists && (
        <section style={{ maxWidth: 980, margin: "0 auto 28px", textAlign: "left" }}>
          <h2 style={{ margin: "0 0 10px" }}>My Wishlists</h2>
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "1fr",
            }}
          >
            {lists.map((l) => (
              <Link
                key={l.id}
                href={`/list/${l.id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  background: "#fff",
                  borderRadius: 8,
                  border: "1px solid #e8e2d9",
                  padding: "12px 14px",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 800 }}>{l.name || "Wishlist"}</div>
                <div style={{ color: "#666", fontSize: 13 }}>
                  {l.isPublic ? "🔗 Public" : "🔒 Private"} {l.updatedAt ? "• updated" : ""}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Your existing single-list items feed */}
      <section style={{ marginTop: 20, maxWidth: 700, marginInline: "auto", textAlign: "left" }}>
        <h2 style={{ margin: "0 0 10px" }}>Recent Items</h2>
        {items.length === 0 ? (
          <p style={{ color: "#444" }}>
            No books yet. Tap <strong>“Scan a Book”</strong> to start your wishlist.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((it, index) => (
              <li
                key={index}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "12px 8px",
                  borderBottom: "1px solid #ddd",
                  alignItems: "center",
                  background: "#fff",
                  borderRadius: 8,
                  marginBottom: 10,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                }}
              >
                {it.coverUrl && (
                  <img
                    src={it.coverUrl}
                    width={60}
                    height={90}
                    alt={it.title}
                    style={{ borderRadius: 4, objectFit: "cover" }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 700 }}>{it.title}</div>
                  <div style={{ color: "#555" }}>
                    {(it.authors || []).join(", ")}
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>ISBN: {it.isbn}</div>
                  {libroSearchUrl && (
                    <div style={{ marginTop: 6 }}>
                      <a
                        href={libroSearchUrl(it.title, (it.authors || [])[0])}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "#365c4a",
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        🎧 Find on Libro.fm
                      </a>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
