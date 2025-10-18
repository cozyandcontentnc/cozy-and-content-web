// src/app/s/[shareId]/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getPublicMapping } from "@/lib/wishlists";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { addToOrder } from "@/lib/order";

export default function PublicList({ params }) {
  const { shareId } = params;
  const qs = useSearchParams();
  const focusItem = qs.get("item") || null;

  const [meta, setMeta] = useState(null); // { ownerUid, listId }
  const [items, setItems] = useState(null);
  const [title, setTitle] = useState("Shared Wishlist");
  const [status, setStatus] = useState("");

  const focusedIndex = useMemo(() => {
    if (!items || !focusItem) return -1;
    return items.findIndex(b => b.id === focusItem);
  }, [items, focusItem]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const mapping = await getPublicMapping(shareId);
      if (!mapping) {
        if (alive) setStatus("List not found.");
        return;
      }
      if (alive) setMeta(mapping);

      try {
        const qRef = query(
          collection(db, "users", mapping.ownerUid, "wishlists", mapping.listId, "items"),
          orderBy("addedAt", "desc")
        );
        const snap = await getDocs(qRef);
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data()) }));
        if (alive) {
          setItems(rows);
          // (Optional) set a nicer title if list name is known elsewhere
        }
      } catch (e) {
        console.error(e);
        if (alive) setStatus("Unable to load list.");
      }
    })();
    return () => { alive = false; };
  }, [shareId]);

  function onAdd(b) {
    addToOrder({
      title: b.title,
      author: b.author || (Array.isArray(b.authors) ? b.authors.join(", ") : ""),
      isbn: b.isbn || "",
      image: b.image || b.coverUrl || "",
      fromShareId: shareId,
      ownerUid: meta?.ownerUid,
      listId: meta?.listId,
      itemId: b.id,
    });
    setStatus("Added to your Requests tab.");
    setTimeout(() => setStatus(""), 1500);
  }

  if (status && !items) return <div style={{ padding: 20 }}>{status}</div>;
  if (!items) return <div style={{ padding: 20 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>{title}</h1>
      {status && <div className="cc-card" style={{ marginBottom: 12 }}>{status}</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {items.map((b, i) => (
          <div
            key={b.id}
            className="cc-card"
            style={{
              display: "grid",
              gap: 6,
              outline: i === focusedIndex ? "2px solid var(--cc-accent)" : "none",
            }}
          >
            <div style={{ fontWeight: 700 }}>{b.title}</div>
            {(b.author || b.authors) && (
              <div style={{ opacity: 0.8 }}>
                {b.author || (Array.isArray(b.authors) ? b.authors.join(", ") : "")}
              </div>
            )}
            {b.isbn && <div style={{ fontFamily: "monospace", fontSize: 12 }}>ISBN: {b.isbn}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <button className="cc-btn" onClick={() => onAdd(b)}>+ Add to my order</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
