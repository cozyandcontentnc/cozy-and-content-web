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
  const { id } = useParams();
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
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
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

  // --- Friendly share helpers ---
  function composeShareFields({ kind, item, listName, userName, url, listUrl }) {
    const sender = userName || "a Cozy & Content friend";
    const by = item?.author ? ` by ${item.author}` : "";
    const titleLine =
      kind === "book"
        ? `A book rec from ${sender} 📚`
        : `A wishlist from ${sender} 📝`;

    let body =
      kind === "book"
        ? [
            `Hi there!`,
            ``,
            `${sender} would really love this book:`,
            `${item?.title || "Book"}${by}`,
            ``,
            `You can check it out here: ${url}`,
            ``,
            `If you end up grabbing it, let them know so they can mark it as purchased.`,
            listUrl ? `` : ``,
            listUrl ? `See their full wishlist: ${listUrl}` : ``,
            ``,
            `— Sent from Cozy & Content Wishlists`,
          ]
        : [
            `Hi there!`,
            ``,
            `${sender} shared a wishlist with you:`,
            `${listName || "Wishlist"}`,
            ``,
            `View it here: ${url}`,
            ``,
            `If you pick anything up from this list, please give them a heads-up so they can mark it as purchased.`,
            ``,
            `— Sent from Cozy & Content Wishlists`,
          ];

    body = body.filter(Boolean).join("\n");
    return { title: titleLine, text: body };
  }

  function shareList() {
    if (!list?.shareId) {
      setStatus("Make the list public to share a link.");
      setTimeout(() => setStatus(""), 1500);
      return;
    }
    const url = `${location.origin}/s/${list.shareId}`;
    const { title, text } = composeShareFields({
      kind: "list",
      listName: list.name,
      userName,
      url,
    });
    shareText(title, text, url);
  }

  function shareBook(item) {
    if (!list?.shareId) {
      setStatus("Make the list public to share a link.");
      setTimeout(() => setStatus(""), 1500);
      return;
    }
    const url = `${location.origin}/s/${list.shareId}?item=${item.id}`;
    const listUrl = `${location.origin}/s/${list.shareId}`;
    const { title, text } = composeShareFields({
      kind: "book",
      item,
      listName: list.name,
      userName,
      url,
      listUrl,
    });
    shareText(title, text, url);
  }
  // --- End share helpers ---

  async function onAddToOrder(it) {
    const payload = {
      title: it.title || "",
      author: it.author || (Array.isArray(it.authors) ? it.authors.join(", ") : ""),
      authors: it.authors || [],
      isbn: it.isbn || "",
      image: it.image || it.coverUrl || "",
      fromShareId: null,
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
      {/* Centered title bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          marginBottom: 12,
          gap: 8,
        }}
      >
        <button className="cc-btn-outline" onClick={() => history.back()} style={{ justifySelf: "start" }}>
          ← Back
        </button>

        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, textAlign: "center" }}>
          {list?.name || "Wishlist"}
        </h1>

        <a className="cc-btn-outline" href="/order" style={{ justifySelf: "end" }}>
          🧺 Order
        </a>
      </div>

      {/* Sharing explanation */}
      {list && (
        <div className="cc-card" style={{ marginBottom: 12, lineHeight: 1.4 }}>
          <strong>Sharing tip:</strong> To share this wishlist or individual books, make the wishlist{" "}
          <em>Public</em> first. Use the <strong>{list.isPublic ? "Make Private" : "Make Public"}</strong> button below.
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--cc-sub)" }}>
            Status: {list.isPublic ? "🔗 Public — anyone with the link can view" : "🔒 Private — only you can view"}
          </div>
        </div>
      )}

      {list && (
        <div className="cc-card wishlist-actions">
          <button className="secondary" onClick={onRename}>Rename</button>
          <button className="secondary" onClick={onTogglePublic}>
            {list.isPublic ? "Make Private" : "Make Public"}
          </button>

          {list.isPublic && list.shareId && (
            <ShareMenu
              shareId={list.shareId}
              shareUrl={shareUrl}
              copy={copy}
              shareList={shareList}
            />
          )}

          <a className="secondary" href="/scan">+ Scan More</a>
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
                display: "flex",
                gap: 12,
                alignItems: "center",
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
                <div style={{ opacity: 0.8 }}>
                  {it.author || (Array.isArray(it.authors) ? it.authors.join(", ") : "")}
                </div>
                <div style={{ opacity: 0.6, fontSize: 12 }}>
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

function ShareMenu({ shareId, shareUrl, copy, shareList }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);

  return (
    <div style={{ position: "relative" }}>
      <button className="cc-btn-outline secondary share-btn" onClick={toggle}>
        📤 Share
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            background: "var(--cc-card)",
            border: "1px solid var(--cc-border)",
            borderRadius: 8,
            padding: 8,
            boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
            zIndex: 10,
            minWidth: 160,
          }}
        >
          <a
            className="cc-link"
            href={`/s/${shareId}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: "block", padding: "6px 8px" }}
            onClick={close}
          >
            🔗 View Public Link
          </a>
          <button
            className="cc-btn-outline"
            onClick={() => { copy(shareUrl); close(); }}
            style={{ width: "100%", textAlign: "left", marginTop: 4 }}
          >
            📋 Copy Link
          </button>
          <button
            className="cc-btn-outline"
            onClick={() => { shareList(); close(); }}
            style={{ width: "100%", textAlign: "left", marginTop: 4 }}
          >
            💬 Share List
          </button>
          <a
            href="/order"
            className="cc-btn-outline"
            style={{ display: "block", width: "100%", marginTop: 4, textAlign: "left" }}
            onClick={close}
          >
            ✉️ Email My Order
          </a>
        </div>
      )}
    </div>
  );
}
