// src/app/list/[id]/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { removeItemById, togglePublic, renameList } from "@/lib/wishlists";
import { shareText } from "@/lib/share";
import { addToOrder } from "@/lib/order";
import { libroSearchUrl } from "@/lib/libro";

export default function ListPage() {
  const { id } = useParams();      // wishlist id
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u?.uid) router.replace("/account/login");
      else {
        setUid(u.uid);
        setUserName(u.displayName || "A Cozy Shopper");
      }
    });
    return () => unsub();
  }, [router]);

  // subscribe to list + items (keep doc ids!)
  useEffect(() => {
    if (!uid || !id) return;

    const listRef = doc(db, "users", uid, "wishlists", id);
    getDoc(listRef).then((snap) => {
      if (!snap.exists()) {
        setStatus("List not found.");
        return;
      }
      setList({ id: snap.id, ...snap.data() });
    });

    const qRef = query(
      collection(db, "users", uid, "wishlists", id, "items"),
      orderBy("addedAt", "desc")
    );
    const unsub = onSnapshot(qRef, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data()) })));
    });
    return () => unsub();
  }, [uid, id]);

  async function onDelete(itemId) {
    try {
      setStatus("Deleting…");
      await removeItemById(uid, id, itemId);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Failed to delete item.");
    }
  }

  async function onTogglePublic() {
    try {
      const next = !(list?.isPublic);
      const shareId = await togglePublic(uid, id, next);
      setList((l) => ({ ...l, isPublic: next, shareId: next ? shareId : null }));
    } catch (e) {
      console.error(e);
      setStatus("Failed to toggle public.");
      setTimeout(() => setStatus(""), 1500);
    }
  }

  async function onRename() {
    const newName = prompt("Rename list:", list?.name || "Wishlist");
    if (!newName || !newName.trim()) return;
    try {
      await renameList(uid, id, newName.trim());
      setList((l) => ({ ...l, name: newName.trim() }));
    } catch (e) {
      console.error(e);
    }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(
      () => setStatus("Link copied"),
      () => setStatus("Could not copy link")
    );
    setTimeout(() => setStatus(""), 1500);
  }

  async function togglePurchased(item) {
    try {
      await updateDoc(doc(db, "users", uid, "wishlists", id, "items", item.id), {
        purchased: !item.purchased,
      });
    } catch (e) {
      console.error(e);
    }
  }

  function firstAuthor(it) {
    if (it.author) return it.author;
    if (Array.isArray(it.authors) && it.authors.length) return it.authors[0];
    return "";
  }

  function shareList() {
    if (!list?.shareId) {
      setStatus("Make the list public to share a link.");
      setTimeout(() => setStatus(""), 1500);
      return;
    }
    const url = `${location.origin}/s/${list.shareId}`;
    shareText(
      `Wishlist from ${list.name || "Cozy & Content"}`,
      `${userName} would love these books!`,
      url
    );
  }

  function shareBook(item) {
    if (!list?.shareId) {
      setStatus("Make the list public to share a link.");
      setTimeout(() => setStatus(""), 1500);
      return;
    }
    const url = `${location.origin}/s/${list.shareId}?item=${item.id}`;
    const by = item.author ? ` by ${item.author}` : "";
    shareText(item.title || "Book", `${(item.title || "Book")}${by} — from ${userName}`, url);
  }

  async function onAddToOrder(it) {
    const payload = {
      title: it.title || "",
      author: it.author || (Array.isArray(it.authors) ? it.authors.join(", ") : ""),
      authors: it.authors || [],
      isbn: it.isbn || "",
      image: it.image || it.coverUrl || "",
      fromShareId: null,        // in-app list page, not from a public share
      ownerUid: uid,
      listId: id,
      itemId: it.id,
    };
    const res = await addToOrder(payload);
    setStatus(res?.wroteBookRequests ? "Added to order (synced)" : "Added to order");
    setTimeout(() => setStatus(""), 1200);
  }

  const shareUrl = list?.shareId ? `${location.origin}/s/${list.shareId}` : "";

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{list?.name || "Wishlist"}</h1>
        <a className="cc-btn-outline" href="/order">🧺 Order</a>
      </div>

{list && (
  <div className="cc-card wishlist-actions">
    <button className="secondary" onClick={onRename}>Rename</button>
    <button className="secondary" onClick={onTogglePublic}>
      {list.isPublic ? "Make Private" : "Make Public"}
    </button>

    {list.isPublic && list.shareId && (
      <>
        <a className="secondary" href={`/s/${list.shareId}`} target="_blank" rel="noreferrer">
          Public Link
        </a>
        <button className="secondary" onClick={() => copy(shareUrl)}>Copy Link</button>
        <button className="secondary" onClick={shareList}>Share List</button>
      </>
    )}

    <div className="spacer" />

    <a className="secondary" href="/scan">+ Scan More</a>
    <a href="/order" className="cc-btn">✉️ Email My Order</a>
  </div>
)}

      {status && <div className="cc-card" style={{ marginBottom: 12 }}>{status}</div>}

      {items.length === 0 ? (
        <div className="cc-card">No items yet.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {items.map((it) => (
            <li
              key={it.id}
              className="cc-card"
              style={{
                display:"flex",
                gap:12,
                alignItems:"center",
                opacity: it.purchased ? 0.6 : 1,
              }}
            >
              {(it.coverUrl || it.image) && (
                <img
                  src={it.coverUrl || it.image}
                  width={60}
                  height={90}
                  alt={it.title || "Book cover"}
                  style={{ borderRadius: 6, objectFit: "cover" }}
                  onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  {it.title} {it.purchased ? "— Purchased" : ""}
                </div>
                <div style={{ opacity: .8 }}>
                  {it.author || (Array.isArray(it.authors) ? it.authors.join(", ") : "")}
                </div>
                <div style={{ opacity: .6, fontSize: 12 }}>
                  ID: {it.id}{it.isbn ? ` • ISBN: ${it.isbn}` : ""}
                </div>

<div className="item-actions">
  <a
    className="cc-btn-outline"
    href={libroSearchUrl(it.title, firstAuthor(it))}
    target="_blank"
    rel="noreferrer"
  >
    🎧 Find on Libro.fm
  </a>

  {list?.isPublic && list?.shareId && (
    <button className="cc-btn-outline" onClick={() => shareBook(it)}>
      Share this book
    </button>
  )}

  <button className="cc-btn" onClick={() => onAddToOrder(it)}>
    ➕ Add to Order
  </button>

  <button className="cc-btn-outline" onClick={() => togglePurchased(it)}>
    {it.purchased ? "Mark as unpurchased" : "Mark as purchased"}
  </button>

  <button className="cc-btn-outline" onClick={() => onDelete(it.id)}>
    🗑️ Delete
  </button>
</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
