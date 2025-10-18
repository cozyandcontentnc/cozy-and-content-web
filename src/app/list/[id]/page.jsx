// src/app/list/[id]/page.jsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ensureAuth, db } from "@/lib/firebase";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { renameList, togglePublic } from "@/lib/wishlists";
import { shareText } from "@/lib/share";
import { libroGiftCreditsUrl, libroSearchByIsbn } from "@/lib/libro";

export default function ListPage() {
  const { id } = useParams(); // listId
  const [uid, setUid] = useState(null);

  const [meta, setMeta] = useState({ name: "Wishlist", isPublic: false, shareId: null });
  const [items, setItems] = useState([]);
  const dynamic = "force-dynamic";

  useEffect(() => {
    let stopMeta = null;
    let stopItems = null;

    (async () => {
      const user = await ensureAuth();
      if (!user?.uid) return;
      setUid(user.uid);

      stopMeta = onSnapshot(doc(db, "users", user.uid, "wishlists", id), (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setMeta({ name: d.name || "Wishlist", isPublic: !!d.isPublic, shareId: d.shareId || null });
        }
      });

      stopItems = onSnapshot(collection(db, "users", user.uid, "wishlists", id, "items"), (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data()) })));
      });
    })();

    return () => { if (stopMeta) stopMeta(); if (stopItems) stopItems(); };
  }, [id]);

  async function onRename() {
    const newName = prompt("Rename list:", meta.name);
    if (uid && newName && newName.trim()) {
      await renameList(uid, id, newName.trim());
    }
  }

  async function onTogglePublic() {
    if (!uid) return;
    const sid = await togglePublic(uid, id, !meta.isPublic);
    setMeta((m) => ({ ...m, isPublic: !m.isPublic, shareId: sid || null }));
  }

  async function onShareList() {
    const url = meta.shareId ? `${location.origin}/s/${meta.shareId}` : undefined;
    const body =
      items.map((b, i) => `${i + 1}. ${b.title}${b.author ? ` — ${b.author}` : ""}${b.isbn ? ` (ISBN ${b.isbn})` : ""}`).join("\n") +
      `\n\nGift credits: ${libroGiftCreditsUrl()}`;
    await shareText(meta.name, body, url);
  }

  return (
    <div style={{ maxWidth:760, margin:"0 auto", padding:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <Link className="cc-btn-outline" href="/">← Home</Link>
        <h1 style={{ fontSize:20, fontWeight:700 }}>{meta.name}</h1>
        <button className="cc-btn-outline" onClick={onRename}>Rename</button>
      </div>

      <div className="cc-card" style={{ display:"flex", gap:8, alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <button className="cc-btn" onClick={onShareList}>Share list</button>
          <button className="cc-btn-outline" onClick={onTogglePublic}>
            {meta.isPublic ? "Make Private" : "Make Public"}
          </button>
          {meta.isPublic && meta.shareId && (
            <a className="cc-link" href={`/s/${meta.shareId}`} target="_blank">Public link</a>
          )}
        </div>
        <Link className="cc-btn-outline" href="/scan">+ Scan more</Link>
      </div>

      <div style={{ marginTop:12, display:"grid", gap:8 }}>
        {items.map((b) => (
          <div key={b.id} className="cc-card" style={{ display:"grid", gap:6 }}>
            <div style={{ fontWeight:700 }}>{b.title}</div>
            {b.author && <div style={{ opacity:.8 }}>{b.author}</div>}
            {b.isbn && <div style={{ fontFamily:"monospace", fontSize:12 }}>ISBN: {b.isbn}</div>}

            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {b.isbn && (
                <a className="cc-btn-outline" href={libroSearchByIsbn(b.isbn)} target="_blank" rel="noreferrer">
                  Gift on Libro.fm
                </a>
              )}
              <button
                className="cc-btn-outline"
                onClick={() =>
                  shareText(
                    b.title,
                    `${b.title}${b.author ? ` — ${b.author}` : ""}${b.isbn ? `\n${libroSearchByIsbn(b.isbn)}` : ""}`
                  )
                }
              >
                Share book
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
