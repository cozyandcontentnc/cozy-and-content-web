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
import { libroSearchUrl } from "@/lib/libro"; // only one helper now

export default function ListPage() {
  const { id } = useParams();      // wishlist id
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u?.uid) router.replace("/account/login");
      else setUid(u.uid);
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

  // Copy function to copy text to clipboard
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

  function shareList() {
    if (navigator.share) {
      navigator.share({
        title: `Check out this wishlist from ${list.name}`,
        text: `${list.name} - Here's what I'd like: [user's name] would love these books! Let us know if it's in stock or if it needs to be ordered.`,
        url: `${location.origin}/s/${list.shareId}`,
      }).then(() => {
        setStatus("List shared successfully!");
      }).catch(err => {
        console.error("Error sharing:", err);
        setStatus("Failed to share the list.");
      });
    } else {
      setStatus("Your browser does not support sharing.");
    }
  }

  function shareBook(item) {
    if (navigator.share) {
      navigator.share({
        title: item.title,
        text: `${item.title} by ${item.author} — [user's name] would love this book! Let us know if it's in stock or if it needs to be ordered.`,
        url: `${location.origin}/s/${list.shareId}?item=${item.id}`,
      }).then(() => {
        setStatus("Book shared successfully!");
      }).catch(err => {
        console.error("Error sharing:", err);
        setStatus("Failed to share the book.");
      });
    } else {
      setStatus("Your browser does not support sharing.");
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{list?.name || "Wishlist"}</h1>
        <a className="cc-btn-outline" href="/">Home</a>
      </div>

      {list && (
        <div className="cc-card" style={{ marginBottom: 12, display:"flex", gap:8, alignItems:"center", justifyContent:"space-between", flexWrap:"wrap" }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button className="cc-btn-outline" onClick={onRename}>Rename</button>
            <button className="cc-btn-outline" onClick={onTogglePublic}>
              {list.isPublic ? "Make Private" : "Make Public"}
            </button>
            {list.isPublic && list.shareId && (
              <>
                <a className="cc-link" href={`/s/${list.shareId}`} target="_blank" rel="noreferrer">Public link</a>
                <button
                  className="cc-btn-outline"
                  onClick={() => copy(`${location.origin}/s/${list.shareId}`)}
                >
                  Copy list link
                </button>
                <button className="cc-btn-outline" onClick={shareList}>Share this list</button>
              </>
            )}
          </div>
          <a className="cc-btn-outline" href="/scan">+ Scan more</a>
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
              {it.image && <img src={it.image} width={60} height={90} alt={it.title} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  {it.title} {it.purchased ? "— Purchased" : ""}
                </div>
                <div style={{ opacity: .8 }}>{it.author || (Array.isArray(it.authors) ? it.authors.join(", ") : "")}</div>
                <div style={{ opacity: .6, fontSize: 12 }}>
                  ID: {it.id}{it.isbn ? ` • ISBN: ${it.isbn}` : ""}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {/* Deep link to Libro.fm (by title/author) */}
                  <a className="cc-btn-outline" href={libroSearchUrl(it.title, it.author)} target="_blank" rel="noreferrer">
                    🎧 Find on Libro.fm
                  </a>

                  {/* Share single book (only if list is public & has shareId) */}
                  {list?.isPublic && list?.shareId && (
                    <button
                      className="cc-btn-outline"
                      onClick={() => shareBook(it)}
                    >
                      Share this book
                    </button>
                  )}

                  {/* Owner controls */}
                  <button className="cc-btn-outline" onClick={() => togglePurchased(it)}>
                    {it.purchased ? "Mark as unpurchased" : "Mark as purchased"}
                  </button>
                  <button className="cc-btn-outline" onClick={() => onDelete(it.id)}>🗑️ Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
