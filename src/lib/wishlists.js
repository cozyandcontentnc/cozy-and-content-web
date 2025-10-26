// src/app/wishlists/[listId]/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  togglePublic,
  removeItemById,
  renameList,
} from "@/lib/wishlists";

export default function WishlistPage() {
  const router = useRouter();
  const params = useParams();
  const listId = Array.isArray(params?.listId) ? params.listId[0] : params?.listId;

  const [uid, setUid] = useState(null);
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);

  // Capture the signed-in user id
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setUid(user?.uid || null);
      if (!user) {
        // If not signed in, send to home (or your login)
        router.push("/");
      }
    });
    return () => unsub();
  }, [router]);

  // Subscribe to list doc
  useEffect(() => {
    if (!uid || !listId) return;
    const ref = doc(db, "users", uid, "wishlists", listId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setList(null);
        } else {
          setList({ id: snap.id, ...snap.data() });
        }
        setLoadingList(false);
      },
      () => setLoadingList(false)
    );
    return () => unsub();
  }, [uid, listId]);

  // Subscribe to items
  useEffect(() => {
    if (!uid || !listId) return;
    const col = collection(db, "users", uid, "wishlists", listId, "items");
    const q = query(col, orderBy("addedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setItems(arr);
        setLoadingItems(false);
      },
      () => setLoadingItems(false)
    );
    return () => unsub();
  }, [uid, listId]);

  const isPublic = !!list?.isPublic;
  const listName = list?.name ?? "Wishlist";

  // Handlers
  const handleAddBook = () => {
    // open your "add manual" UI; swap as needed
    const title = prompt("Add a book by title (quick add):");
    if (!title || !uid) return;
    const ref = doc(collection(db, "users", uid, "wishlists", listId, "items"));
    writeBatch(db)
      .set(ref, {
        title,
        author: "",
        authors: [],
        isbn: "",
        image: "",
        coverUrl: "",
        thumbnail: "",
        addedAt: serverTimestamp(),
      })
      .set(doc(db, "users", uid, "wishlists", listId), { updatedAt: serverTimestamp() }, { merge: true })
      .commit();
  };

  const handleScan = () => router.push("/scan");

  const handleRename = async () => {
    if (!uid) return;
    const next = prompt("Rename list:", listName);
    if (!next || next === listName) return;
    try {
      await renameList(uid, listId, next);
    } catch (e) {
      alert(e?.message || "Rename failed.");
    }
  };

  const handleShare = async () => {
    if (!uid) return;
    try {
      const next = !isPublic;
      await togglePublic(uid, listId, next);
      // Optional: copy current URL (keeps things simple & non-speculative)
      if (next) {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch (e) {
      alert(e?.message || "Share toggle failed.");
    }
  };

  const handleExport = () => {
    const rows = [
      ["Title", "Author(s)", "ISBN", "Added At"],
      ...items.map((it) => [
        safeCSV(it.title),
        safeCSV(it.author || (Array.isArray(it.authors) ? it.authors.join(", ") : "")),
        safeCSV(it.isbn || ""),
        safeCSV(tsToLocal(it.addedAt)),
      ]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(listName || "wishlist").replace(/\s+/g, "-").toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDeleteList = async () => {
    if (!uid) return;
    if (!confirm("Delete this list and all its items? This cannot be undone.")) return;

    // Delete in batches to stay under limits
    try {
      const itemsCol = collection(db, "users", uid, "wishlists", listId, "items");
      while (true) {
        const page = await getDocs(query(itemsCol, limit(400)));
        if (page.empty) break;
        const batch = writeBatch(db);
        page.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        if (page.size < 400) break;
      }
      await deleteDoc(doc(db, "users", uid, "wishlists", listId));
      router.push("/wishlists"); // go back to lists index
    } catch (e) {
      alert(e?.message || "Delete failed.");
    }
  };

  const handleRemoveItem = async (itemId) => {
    if (!uid) return;
    try {
      await removeItemById(uid, listId, itemId);
    } catch (e) {
      alert(e?.message || "Remove failed.");
    }
  };

  const handleSort = () => {
    // Simple demo: toggle client-side sort as an example
    // Replace with your own modal/sort UI if you like.
    const mode = prompt(
      "Sort by:\n1 = Newest first\n2 = Title A→Z\n3 = Author A→Z",
      "1"
    );
    if (!mode) return;
    if (mode === "2") {
      setItems((prev) =>
        [...prev].sort((a, b) => (a.title || "").localeCompare(b.title || ""))
      );
    } else if (mode === "3") {
      setItems((prev) =>
        [...prev].sort((a, b) =>
          (a.author || a.authors?.[0] || "").localeCompare(b.author || b.authors?.[0] || "")
        )
      );
    } else {
      // Default: newest first (already via query order), do nothing
    }
  };

  const header = useMemo(() => {
    if (loadingList) return "Loading…";
    if (!list) return "Wishlist";
    return listName;
  }, [loadingList, list, listName]);

  return (
    <div className="cc-card" style={{ maxWidth: 1000, margin: "16px auto" }}>
      {/* Action Row */}
      <div className="wishlist-actions">
        <button onClick={handleAddBook}>Add Book</button>
        <button className="secondary" onClick={handleScan}>Scan Barcode</button>
        <button className="secondary" onClick={handleRename}>Rename</button>
        <button className="secondary" onClick={handleShare}>
          {isPublic ? "Make Private" : "Make Public"}
        </button>

        <div className="spacer" />

        <button className="secondary" onClick={handleSort}>Sort</button>
        <button onClick={handleExport}>Export</button>
        <button className="danger" onClick={handleDeleteList}>Delete</button>
      </div>

      <h1 style={{ margin: "0 0 8px 0", fontSize: 20 }}>{header}</h1>
      {isPublic ? (
        <p style={{ marginTop: 0, color: "var(--cc-sub)" }}>This list is public.</p>
      ) : (
        <p style={{ marginTop: 0, color: "var(--cc-sub)" }}>This list is private.</p>
      )}

      {/* Items */}
      <div style={{ marginTop: 12 }}>
        {loadingItems ? (
          <p>Loading books…</p>
        ) : items.length === 0 ? (
          <EmptyState onAdd={handleAddBook} onScan={handleScan} />
        ) : (
          <ItemGrid items={items} onRemove={handleRemoveItem} />
        )}
      </div>
    </div>
  );
}

function ItemGrid({ items, onRemove }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      {items.map((it) => (
        <div key={it.id} className="cc-card" style={{ padding: 10 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 60, flex: "0 0 auto" }}>
              <Cover src={it.thumbnail || it.coverUrl || it.image} alt={it.title} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                {it.title || "Untitled"}
              </div>
              <div style={{ color: "var(--cc-sub)", fontSize: 12, marginTop: 4 }}>
                {it.author || (Array.isArray(it.authors) ? it.authors.join(", ") : "")}
              </div>
              {it.isbn ? (
                <div style={{ color: "var(--cc-sub)", fontSize: 12, marginTop: 2 }}>
                  ISBN: {it.isbn}
                </div>
              ) : null}
              <div style={{ marginTop: 8 }}>
                <button className="cc-btn-outline" onClick={() => onRemove(it.id)}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Cover({ src, alt }) {
  const fallback =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='90'><rect width='100%' height='100%' fill='%23f0eae2'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10' fill='%237a6e64'>No Cover</text></svg>`
    );
  return (
    <img
      src={src || fallback}
      alt={alt || "Cover"}
      style={{
        display: "block",
        width: "60px",
        height: "90px",
        objectFit: "cover",
        borderRadius: 6,
        border: "1px solid var(--cc-border)",
        background: "#f8f5f0",
      }}
      onError={(e) => {
        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
      }}
    />
  );
}

function EmptyState({ onAdd, onScan }) {
  return (
    <div
      className="cc-card"
      style={{ textAlign: "center", padding: 24, borderStyle: "dashed" }}
    >
      <p style={{ marginTop: 0, marginBottom: 8 }}>
        No books here yet. Let’s add your first one!
      </p>
      <div className="wishlist-actions" style={{ justifyContent: "center", marginBottom: 0 }}>
        <button onClick={onAdd}>Add Book</button>
        <button className="secondary" onClick={onScan}>Scan Barcode</button>
      </div>
    </div>
  );
}

// Helpers
function safeCSV(s) {
  if (s == null) return "";
  return String(s);
}
function csvCell(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function tsToLocal(ts) {
  // Handles Firestore Timestamp-like objects or ISO strings
  try {
    if (!ts) return "";
    // Firestore serverTimestamp resolves after write; during live view it might be { seconds, nanoseconds }
    if (typeof ts?.toDate === "function") return ts.toDate().toLocaleString();
    if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toLocaleString();
    return "";
  } catch {
    return "";
  }
}
