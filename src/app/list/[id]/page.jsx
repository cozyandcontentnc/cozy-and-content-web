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
} from "firebase/firestore";
import { removeItem } from "@/lib/wishlists";
import { libroSearchByIsbn, libroSearchUrl, libroGiftCreditsUrl } from "@/lib/libro";

export default function ListPage() {
  const { id } = useParams();      // wishlist id
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u?.uid) {
        router.replace("/account/login");
      } else {
        setUid(u.uid);
      }
    });
    return () => unsub();
  }, [router]);

  // subscribe to list + items
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
      setItems(snap.docs.map((d) => d.data()));
    });
    return () => unsub();
  }, [uid, id]);

  async function onDelete(isbn) {
    try {
      setStatus("Deleting…");
      await removeItem(uid, id, isbn);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Failed to delete item.");
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{list?.name || "Wishlist"}</h1>
        <a className="cc-btn-outline" href="/">Home</a>
      </div>

      {status && <div className="cc-card" style={{ marginBottom: 12 }}>{status}</div>}

      {items.length === 0 ? (
        <div className="cc-card">No items yet.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {items.map((it) => (
            <li key={it.isbn} className="cc-card" style={{ display:"flex", gap:12, alignItems:"center" }}>
              {it.image && <img src={it.image} width={60} height={90} alt={it.title} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{it.title}</div>
                <div style={{ opacity: .8 }}>{it.author || (Array.isArray(it.authors) ? it.authors.join(", ") : "")}</div>
                <div style={{ opacity: .6, fontSize: 12 }}>ISBN: {it.isbn}</div>

                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <a className="cc-btn-outline" href={libroSearchByIsbn(it.isbn)} target="_blank" rel="noreferrer">
                    🔎 Find on Libro.fm
                  </a>
                  <a className="cc-btn-outline" href={libroSearchUrl(it.title, it.author)} target="_blank" rel="noreferrer">
                    🎧 Search title/author
                  </a>
                  <a className="cc-btn-outline" href={libroGiftCreditsUrl()} target="_blank" rel="noreferrer">
                    💝 Gift credits
                  </a>
                  <button className="cc-btn-outline" onClick={() => onDelete(it.isbn)}>
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
