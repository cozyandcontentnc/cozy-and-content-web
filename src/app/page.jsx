// src/app/page.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ensureAuth, db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  getCountFromServer,
  deleteDoc,
} from "firebase/firestore";
import { createList, renameList } from "@/lib/wishlists";

export default function Page() {
  const [uid, setUid] = useState(null);
  const [lists, setLists] = useState([]); // [{id, name, isPublic, shareId, updatedAt, count?}]
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Ensure auth, load wishlists
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth();
      if (!active || !user?.uid) return;
      setUid(user.uid);

      const qRef = query(
        collection(db, "users", user.uid, "wishlists"),
        orderBy("updatedAt", "desc")
      );
      const unsub = onSnapshot(qRef, async (snap) => {
        const base = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLists(base);

        // (Optional) fetch counts for each list (subcollection items)
        setLoadingCounts(true);
        try {
          const withCounts = await Promise.all(
            base.map(async (l) => {
              try {
                const coll = collection(db, "users", user.uid, "wishlists", l.id, "items");
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
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onCreate() {
    if (!uid) return;
    const name = prompt("New list name:", `Visit — ${new Date().toLocaleDateString()}`);
    if (!name) return;
    await createList(uid, name);
  }

  async function onRename(listId, currentName) {
    if (!uid) return;
    const next = prompt("Rename list:", currentName);
    if (next && next.trim()) {
      await renameList(uid, listId, next.trim());
    }
  }

  async function onDelete(listId) {
    if (!uid) return;
    const ok = confirm("Delete this list (and its items)? This cannot be undone.");
    if (!ok) return;
    // Delete the list doc; (subcollection cleanup can be added later with a CF or batch)
    await deleteDoc(doc(db, "users", uid, "wishlists", listId));
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Cozy & Content — Wishlists</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/scan" className="cc-btn" style={{ textDecoration: "none" }}>📷 Scan a Book</a>
          <button className="cc-btn-outline" onClick={onCreate}>+ New List</button>
        </div>
      </header>

      {lists.length === 0 ? (
        <div className="cc-card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}>
            No lists yet. Click <strong>+ New List</strong> or start with <strong>📷 Scan a Book</strong>.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {lists.map((l) => (
            <div key={l.id} className="cc-card" style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <Link href={`/list/${l.id}`} className="cc-link" style={{ fontSize: 18, fontWeight: 700 }}>
                    {l.name || "Untitled List"}
                  </Link>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    {loadingCounts
                      ? "…"
                      : typeof l.count === "number"
                      ? `${l.count} item${l.count === 1 ? "" : "s"}`
                      : ""}
                  </span>
                  {l.isPublic && l.shareId ? (
                    <a href={`/s/${l.shareId}`} target="_blank" className="cc-link" style={{ fontSize: 12 }}>
                      Public link
                    </a>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/list/${l.id}`} className="cc-btn-outline" style={{ textDecoration: "none" }}>
                    Open
                  </Link>
                  <button className="cc-btn-outline" onClick={() => onRename(l.id, l.name)}>Rename</button>
                  <button className="cc-btn-outline" onClick={() => onDelete(l.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
