// src/app/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  getCountFromServer,
} from "firebase/firestore";

export default function HomePage() {
  const [uid, setUid] = useState(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [lists, setLists] = useState([]);
  const [loadingCounts, setLoadingCounts] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setIsAuthed(!!u);
      setUid(u?.uid || null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const qRef = query(collection(db, "users", uid, "wishlists"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(qRef, async (snap) => {
      const base = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLists(base);

      // fetch counts for each list (server aggregate)
      setLoadingCounts(true);
      try {
        const withCounts = await Promise.all(
          base.map(async (l) => {
            try {
              const coll = collection(db, "users", uid, "wishlists", l.id, "items");
              const agg = await getCountFromServer(coll);
              return { ...l, count: agg.data().count || 0 };
            } catch {
              return { ...l, count: undefined };
            }
          })
        );
        setLists(withCounts);
      } finally {
        setLoadingCounts(false);
      }
    });
    return () => unsub();
  }, [uid]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Cozy & Content — Wishlists</h1>
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

      {!uid && (
        <div className="cc-card">You’re not signed in. Log in to view and save your wishlists.</div>
      )}

      {uid && lists.length === 0 && (
        <div className="cc-card">No lists yet. Open <strong>Scan</strong> and add your first book — we’ll create a list for you.</div>
      )}

      {uid && lists.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {lists.map((l) => (
            <div key={l.id} className="cc-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display:"flex", gap:8, alignItems:"baseline", flexWrap:"wrap" }}>
                <Link href={`/list/${l.id}`} className="cc-link" style={{ fontSize: 18, fontWeight: 700 }}>
                  {l.name || "Untitled List"}
                </Link>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {loadingCounts ? "…" : typeof l.count === "number" ? `${l.count} item${l.count === 1 ? "" : "s"}` : ""}
                </span>
                {l.isPublic && l.shareId && (
                  <a href={`/s/${l.shareId}`} className="cc-link" target="_blank" style={{ fontSize: 12 }}>
                    Public link
                  </a>
                )}
              </div>
              <Link href={`/list/${l.id}`} className="cc-btn-outline" style={{ textDecoration: "none" }}>
                Open
              </Link>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
