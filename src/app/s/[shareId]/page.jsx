// src/app/s/[shareId]/page.jsx
"use client";

import { useEffect, useState } from "react";
import { getPublicMapping } from "@/lib/wishlists";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function PublicList({ params }) {
  const { shareId } = params;
  const [items, setItems] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const dynamic = "force-dynamic";
  
  useEffect(() => {
    let alive = true;
    (async () => {
      const mapping = await getPublicMapping(shareId);
      if (!mapping) {
        if (alive) setNotFound(true);
        return;
      }
      const snap = await getDocs(collection(db, "users", mapping.ownerUid, "wishlists", mapping.listId, "items"));
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data()) }));
      if (alive) setItems(rows);
    })();
    return () => { alive = false; };
  }, [shareId]);

  if (notFound) return <div style={{ padding:20 }}>List not found.</div>;
  if (!items) return <div style={{ padding:20 }}>Loading…</div>;

  return (
    <div style={{ maxWidth:760, margin:"0 auto", padding:12 }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:12 }}>Shared Wishlist</h1>
      <div style={{ display:"grid", gap:8 }}>
        {items.map((b) => (
          <div key={b.id} className="cc-card" style={{ display:"grid", gap:6 }}>
            <div style={{ fontWeight:700 }}>{b.title}</div>
            {b.author && <div style={{ opacity:.8 }}>{b.author}</div>}
            {b.isbn && <div style={{ fontFamily:"monospace", fontSize:12 }}>ISBN: {b.isbn}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
