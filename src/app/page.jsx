"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ensureAuth, db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { libroSearchUrl } from "@/lib/libro";

export default function Page() {
  const [uid, setUid] = useState(null);
  const [items, setItems] = useState([]);

  // ensure auth, then store uid
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth();
      if (active) setUid(user?.uid);
    })();
    return () => {
      active = false;
    };
  }, []);

  // subscribe once uid is known
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "wishlists", uid, "items"),
      orderBy("addedAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) =>
      setItems(snap.docs.map((d) => d.data()))
    );
    return unsub;
  }, [uid]);

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
      {/* ✅ Logo Section */}
      <div style={{ marginBottom: 20 }}>
        <Image
          src="/images/logo.png" // must live at public/images/logo.png
          alt="Cozy & Content"
          width={180}
          height={72}
          priority
          style={{
            display: "block",
            margin: "0 auto",
            borderRadius: "8px",
          }}
        />
      </div>

      {/* Friendly Welcome */}
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          margin: "0 0 12px",
          color: "#2a2a2a",
        }}
      >
        Welcome to Cozy & Content!
      </h1>
      <p
        style={{
          fontSize: "1.1rem",
          color: "#555",
          marginBottom: "30px",
          maxWidth: 480,
          marginInline: "auto",
        }}
      >
        Scan books, build wishlists, and see what’s on your shelf.
      </p>

      {/* Navigation Buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "40px",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <button
            style={{
              padding: "12px 20px",
              fontSize: "16px",
              backgroundColor: "#365c4a",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            🏠 Home
          </button>
        </Link>

        <Link href="/scan" style={{ textDecoration: "none" }}>
          <button
            style={{
              padding: "12px 20px",
              fontSize: "16px",
              backgroundColor: "#cfac78",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            📷 Scan a Book
          </button>
        </Link>
      </div>

      {/* Wishlist Items */}
      <div style={{ marginTop: "20px", maxWidth: 700, marginInline: "auto" }}>
        {items.length === 0 ? (
          <p style={{ color: "#444" }}>
            No books yet. Tap <strong>“Scan a Book”</strong> to start your wishlist.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              textAlign: "left",
            }}
          >
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
                  borderRadius: "8px",
                  marginBottom: "10px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                }}
              >
                {it.coverUrl && (
                  <img
                    src={it.coverUrl}
                    width={60}
                    height={90}
                    alt={it.title}
                    style={{ borderRadius: "4px", objectFit: "cover" }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 700 }}>{it.title}</div>
                  <div style={{ color: "#555" }}>
                    {(it.authors || []).join(", ")}
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    ISBN: {it.isbn}
                  </div>
                  {libroSearchUrl && (
                    <div style={{ marginTop: 6 }}>
                      <a
                        href={libroSearchUrl(
                          it.title,
                          (it.authors || [])[0]
                        )}
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
      </div>
    </main>
  );
}
