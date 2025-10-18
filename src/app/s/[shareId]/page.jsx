// src/app/s/[shareId]/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { getPublicMapping } from "@/lib/wishlists";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

export default function PublicList({ params }) {
  const { shareId } = params;
  const [items, setItems] = useState(null);
  const [title, setTitle] = useState("Shared Wishlist");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const mapping = await getPublicMapping(shareId);
      if (!mapping) {
        if (alive) setNotFound(true);
        return;
      }
      // Optionally fetch the list name (lightweight: read first item’s list doc if you want)
      try {
        const qRef = query(
          collection(db, "users", mapping.ownerUid, "wishlists", mapping.listId, "items"),
          orderBy("addedAt", "desc")
        );
        const snap = await getDocs(qRef);
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data()) }));
        if (alive) setItems(rows);
      } catch {
        if (alive) setNotFound(true);
      }
    })();
    return () => { alive = false; };
  }, [shareId]);

  if (notFound) return <div style={{ padding: 20 }}>List not found.</div>;
  if (!items) return <div style={{ padding: 20 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>{title}</h1>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((b) => (
          <div key={b.id} className="cc-card" style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>{b.title}</div>
            {b.author && <div style={{ opacity: 0.8 }}>{b.author}</div>}
            {b.isbn && <div style={{ fontFamily: "monospace", fontSize: 12 }}>ISBN: {b.isbn}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
