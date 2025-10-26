"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ensureAuth, db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";

const LOGO_W = 160;
const LOGO_H = 116;

export default function ListsIndex() {
  const [uid, setUid] = useState(null);
  const [lists, setLists] = useState([]);
  const [legacyCount, setLegacyCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Auth
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth();
      if (!active) return;
      setUid(user?.uid || null);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load multi-list collection: users/{uid}/wishlists
  useEffect(() => {
    if (!uid) return;
    const qRef = query(
      collection(db, "users", uid, "wishlists"),
      orderBy("updatedAt", "desc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        setLists(rows);
        setLoading(false);
      },
      () => {
        setLists([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  // (Optional) peek at legacy single-list count
  useEffect(() => {
    if (!uid) return;
    const qRef = query(
      collection(db, "wishlists", uid, "items"),
      orderBy("addedAt", "desc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => setLegacyCount(snap.size),
      () => setLegacyCount(null)
    );
    return unsub;
  }, [uid]);

  const hasLists = useMemo(() => lists && lists.length > 0, [lists]);

  async function onCreateList() {
    if (!uid || busy) return;
    const name = prompt(
      "Name your new list:",
      `Visit — ${new Date().toLocaleDateString()}`
    );
    if (!name?.trim()) return;
    try {
      setBusy(true);
      const ref = await addDoc(collection(db, "users", uid, "wishlists"), {
        name: name.trim(),
        isPublic: false,
        itemCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      location.href = `/list/${ref.id}`;
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteList(listId, listName) {
    if (!uid || !listId) return;
    const confirmDelete = confirm(
      `Are you sure you want to delete the list "${listName}"? This cannot be undone.`
    );
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, "users", uid, "wishlists", listId));
    } catch (e) {
      console.error("Error deleting list:", e);
      alert("Failed to delete list. Please try again.");
    }
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui",
        background: "#faf7f2",
        minHeight: "100vh",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <button className="cc-btn-outline">← Home</button>
        </Link>
        <div style={{ marginLeft: "auto" }}>
          <Image
            src="/images/logo.png"
            alt="Cozy & Content"
            width={LOGO_W}
            height={LOGO_H}
            priority
            style={{ display: "block", height: "auto", width: "auto" }}
          />
        </div>
      </div>

      <h1 style={{ margin: "0 0 8px", color: "#2a2a2a" }}>All Wishlists</h1>
      <p style={{ color: "#555", marginTop: 0, marginBottom: 18 }}>
        Create, view, and manage your wishlists.
      </p>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <button
          onClick={onCreateList}
          disabled={!uid || busy}
          className="cc-btn"
        >
          ➕ New List
        </button>
        <Link href="/scan" style={{ textDecoration: "none" }}>
          <button className="cc-btn-outline">📷 Scan a Book</button>
        </Link>
      </div>

      {/* Lists */}
      {loading ? (
        <div style={{ color: "#666" }}>Loading your lists…</div>
      ) : hasLists ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "1fr",
            maxWidth: 980,
          }}
        >
          {lists.map((l) => (
            <div
              key={l.id}
              style={{
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e8e2d9",
                padding: "12px 14px",
                boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Link
                href={`/list/${l.id}`}
                style={{
                  flex: 1,
                  textDecoration: "none",
                  color: "inherit",
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {l.name || "Untitled Wishlist"}
                </div>
                <div style={{ color: "#666", fontSize: 13 }}>
                  {l.isPublic ? "🔗 Public" : "🔒 Private"}{" "}
                  {l.itemCount
                    ? `• ${l.itemCount} item${
                        l.itemCount === 1 ? "" : "s"
                      }`
                    : ""}
                </div>
              </Link>
              <button
                className="cc-btn-outline"
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  whiteSpace: "nowrap",
                }}
                onClick={() => onDeleteList(l.id, l.name || "Wishlist")}
              >
                🗑️ Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="cc-card" style={{ maxWidth: 700 }}>
          <p style={{ marginTop: 0 }}>You don’t have any wishlists yet.</p>
          <ul style={{ marginTop: 8 }}>
            <li>
              Click <strong>➕ New List</strong> to create your first one, or
            </li>
            <li>
              Use <Link href="/scan">📷 Scan a Book</Link> to start adding
              items.
            </li>
          </ul>
          {legacyCount !== null && legacyCount > 0 && (
            <p style={{ marginTop: 12, fontSize: 13, color: "#555" }}>
              ⚠️ You have {legacyCount} item
              {legacyCount === 1 ? "" : "s"} in your legacy single-list (
              <code>wishlists/{uid}/items</code>). We can migrate those into a
              new list later.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
