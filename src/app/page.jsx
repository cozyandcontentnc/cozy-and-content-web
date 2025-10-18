"use client";

import { useEffect, useState } from "react";
import { ensureAuth, db } from "@/lib/firebase"; // or "../lib/firebase"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { libroSearchUrl } from "@/lib/libro"; // optional; remove if not added yet

export default function Page() {
  const [uid, setUid] = useState(null);
  const [items, setItems] = useState([]);

  // ensure auth, then store uid
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth();
      if (active) setUid(user.uid);
    })();
    return () => { active = false; };
  }, []);

  // subscribe once uid is known
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "wishlists", uid, "items"), orderBy("addedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map(d => d.data())));
    return unsub;
  }, [uid]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", textAlign: "center" }}>
      {/* Add Logo Image */}
      <div style={{ marginBottom: 20 }}>
        <img
          src="/path-to-your-logo.png" // Adjust with the actual path of your logo image
          alt="Cozy & Content"
          style={{
            width: "150px", // Adjust size accordingly
            height: "auto",
            margin: "0 auto",
            display: "block",
          }}
        />
      </div>

      {/* Welcome Message */}
      <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0 0 20px" }}>
        Welcome to Cozy & Content!
      </h1>
      <p style={{ fontSize: "1rem", color: "#555", marginBottom: "30px" }}>
        Browse your wishlist or add new books to order today.
      </p>

      {/* Navigation Buttons */}
      <div style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
        <button
          style={{
            padding: "12px 20px",
            fontSize: "16px",
            backgroundColor: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          View Wishlist
        </button>

        <button
          style={{
            padding: "12px 20px",
            fontSize: "16px",
            backgroundColor: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Scan a Book
        </button>
      </div>

      {/* Wishlist Items */}
      <div style={{ marginTop: "40px" }}>
        {items.length === 0 ? (
          <p>No books yet. Tap "Scan a Book" to start your wishlist.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {items.map((it, index) => (
              <li
                key={index}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: 12,
                  borderBottom: "1px solid #ddd",
                  alignItems: "center",
                }}
              >
                {it.coverUrl && <img src={it.coverUrl} width={60} height={90} alt={it.title} />}
                <div>
                  <div style={{ fontWeight: 700 }}>{it.title}</div>
                  <div>{(it.authors || []).join(", ")}</div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>ISBN: {it.isbn}</div>
                  {libroSearchUrl && (
                    <div style={{ marginTop: 6 }}>
                      <a href={libroSearchUrl(it.title, (it.authors || [])[0])} target="_blank" rel="noreferrer">
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
