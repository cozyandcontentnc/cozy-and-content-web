// src/app/requests/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { getOrder, removeFromOrder, clearOrder, buildMailto } from "@/lib/order";

export default function RequestsPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    setItems(getOrder());
  }, []);

  function onRemove(idx) {
    setItems(removeFromOrder(idx));
  }

  function onClear() {
    if (!confirm("Clear your request list?")) return;
    clearOrder();
    setItems([]);
  }

  function mailtoHref() {
    return buildMailto({ name, email, items });
  }

  const disabled = items.length === 0;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>My Requests</h1>

      <div className="cc-card" style={{ marginBottom: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Your name</label>
          <input className="cc-card" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Your email</label>
          <input className="cc-card" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            className="cc-btn"
            href={disabled ? undefined : mailtoHref()}
            onClick={(e) => { if (disabled) e.preventDefault(); }}
          >
            ✉️ Email order to Cozy & Content
          </a>
          <button className="cc-btn-outline" onClick={onClear} disabled={disabled}>Clear list</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="cc-card">Your request list is empty. Open a shared link and tap “Add to my order”.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {items.map((b, idx) => (
            <li key={b.itemId + "_" + idx} className="cc-card" style={{ display: "flex", gap: 12 }}>
              {b.image && <img src={b.image} width={60} height={90} alt={b.title} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{b.title}</div>
                {b.author && <div style={{ opacity: 0.8 }}>{b.author}</div>}
                {b.isbn && <div style={{ opacity: 0.7, fontSize: 12 }}>ISBN: {b.isbn}</div>}
                <div style={{ opacity: 0.6, fontSize: 12 }}>
                  From share: <code>{b.fromShareId}</code>
                </div>
              </div>
              <button className="cc-btn-outline" onClick={() => onRemove(idx)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
