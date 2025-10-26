"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ensureAuth, db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { libroSearchUrl } from "@/lib/libro";

const LOGO_W = 220;
const LOGO_H = 160;

export default function Page() {
  const [uid, setUid] = useState(null);
  const [items, setItems] = useState([]);
  const [lists, setLists] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth();
      if (active) setUid(user?.uid || null);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "wishlists", uid, "items"), orderBy("addedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => d.data())));
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const qRef = query(collection(db, "users", uid, "wishlists"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data()) }));
        setLists(rows);
      },
      () => setLists([])
    );
    return unsub;
  }, [uid]);

  const hasLists = lists && lists.length > 0;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", textAlign: "center", background: "#faf7f2", minHeight: "100vh" }}>
      <div style={{ marginBottom: 20 }}>
        <Image
          src="/images/logo.png"
          alt="Cozy & Content"
          width={LOGO_W}
          height={LOGO_H}
          priority
          style={{ display: "block", margin: "0 auto" }}
        />
      </div>

      <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "0 0 8px", color: "#2a2a2a" }}>
        Welcome to Cozy & Content!
      </h1>
      <p style={{ fontSize: "1.05rem", color: "#555", margin: "0 auto 24px", maxWidth: 520 }}>
        Scan books and build wishlists. (Order requests are handled from share links.)
      </p>

      <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
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
      </div>

      {hasLists && (
        <section style={{ maxWidth: 980, margin: "0 auto 28px", textAlign: "left" }}>
          <h2 style={{ margin: "0 0 10px" }}>My Wishlists</h2>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr" }}>
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
                  <div style={{ color: "#555" }}>{(it.authors || []).join(", ")}</div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>ISBN: {it.isbn}</div>
                  {libroSearchUrl && (
                    <div style={{ marginTop: 6 }}>
                      <a
                        href={libroSearchUrl(it.title, (it.authors || [])[0])}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#365c4a", fontWeight: 600, textDecoration: "none" }}
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
