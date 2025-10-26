// src/app/order/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getOrder,
  removeFromOrder,
  clearOrder,
  buildMailto,
} from "@/lib/order";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

const LS_KEY_PROFILE = "cc_order_profile_v1";

export default function OrderPage() {
  const [items, setItems] = useState([]);
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [status, setStatus] = useState("");

  // 1) Load cart and any saved profile
  useEffect(() => {
    setItems(getOrder());
    try {
      const raw = localStorage.getItem(LS_KEY_PROFILE);
      if (raw) setProfile(JSON.parse(raw));
    } catch {}
  }, []);

  // 2) If user is signed in, prefill missing name/email once
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) return;
      setProfile((prev) => {
        const next = {
          name: prev.name || u.displayName || "A Cozy Shopper",
          email: prev.email || u.email || "",
        };
        // persist if we actually filled anything
        if (next.name !== prev.name || next.email !== prev.email) {
          try { localStorage.setItem(LS_KEY_PROFILE, JSON.stringify(next)); } catch {}
        }
        return next;
      });
    });
    return () => unsub();
  }, []);

  const count = items.length;

  function updateProfile(next) {
    setProfile(next);
    try { localStorage.setItem(LS_KEY_PROFILE, JSON.stringify(next)); } catch {}
  }

  function onRemove(idx) {
    const next = removeFromOrder(idx);
    setItems(next);
  }

  function onClear() {
    if (!count) return;
    if (!confirm("Clear all items from your order?")) return;
    clearOrder();
    setItems([]);
  }

  function onEmail(e) {
    e.preventDefault();
    if (!count) {
      setStatus("Add at least one book.");
      setTimeout(() => setStatus(""), 1200);
      return;
    }
    const href = buildMailto({
      name: profile.name || "",
      email: profile.email || "",
      items,
    });
    window.location.href = href;
  }

  const previewLines = useMemo(() => {
    return items.slice(0, 5).map((b, i) => {
      const author =
        b.author || (Array.isArray(b.authors) ? b.authors.join(", ") : "");
      return `${i + 1}. ${b.title || "Untitled"}${author ? " — " + author : ""}${
        b.isbn ? " (ISBN: " + b.isbn + ")" : ""
      }`;
    });
  }, [items]);

  return (
    <main style={{ padding: 16, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <Link href="/" className="cc-btn-outline">← Home</Link>
        <h1 style={{ margin: 0, flex: "1 1 auto" }}>My Order</h1>
        <button
          className="cc-btn-outline"
          onClick={onClear}
          disabled={!count}
          title="Remove all items from this order"
        >
          🧹 Clear all
        </button>
      </div>

      {status && <div className="cc-card" style={{ marginBottom: 12 }}>{status}</div>}

      {/* Profile (auto-filled from account if available, but editable) */}
      <form onSubmit={onEmail}>
        <div className="cc-card" style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          <div>
            <label htmlFor="name" style={{ display: "block", marginBottom: 6 }}>Your Name</label>
            <input
              id="name"
              type="text"
              value={profile.name}
              onChange={(e) => updateProfile({ ...profile, name: e.target.value })}
              placeholder="Your name"
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div>
            <label htmlFor="email" style={{ display: "block", marginBottom: 6 }}>Your Email</label>
            <input
              id="email"
              type="email"
              value={profile.email}
              onChange={(e) => updateProfile({ ...profile, email: e.target.value })}
              placeholder="you@example.com"
              style={{ width: "100%", padding: 8 }}
            />
          </div>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="cc-card">No items in your order. Go to a list or a shared link and tap “Add to Order”.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {items.map((b, idx) => {
              const cover = b.image || b.coverUrl || b.thumbnail || "";
              const author =
                b.author || (Array.isArray(b.authors) ? b.authors.join(", ") : "");
              return (
                <li key={`${b.fromShareId || "list"}-${b.itemId || idx}`} className="cc-card" style={{ display:"flex", gap: 12, alignItems:"center" }}>
                  {cover ? (
                    <img
                      src={cover}
                      width={60}
                      height={90}
                      alt={b.title || "Book cover"}
                      style={{ borderRadius: 6, objectFit: "cover" }}
                      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                    />
                  ) : (
                    <div
                      aria-hidden
                      style={{
                        width: 60, height: 90, borderRadius: 6,
                        background: "linear-gradient(180deg,#f1ede5,#e8e1d6)",
                        border: "1px solid #e7e0d5", display: "grid", placeItems: "center",
                        color: "#9c8f7a", fontSize: 11, fontWeight: 700,
                      }}
                    >
                      No Cover
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>
                      {b.title || "Untitled"}
                    </div>
                    {author && <div style={{ opacity: 0.8 }}>{author}</div>}
                    {b.isbn && <div style={{ fontFamily: "monospace", fontSize: 12 }}>ISBN: {b.isbn}</div>}
                  </div>

                  <button
                    type="button"
                    className="cc-btn-outline"
                    onClick={() => onRemove(idx)}
                    title="Remove this item from the order"
                  >
                    🗑️ Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Email action */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop: 16 }}>
          <button
            type="submit"
            disabled={items.length === 0}
            className="cc-btn"
            style={{
              padding: "10px 20px",
              backgroundColor: "#365c4a",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              borderRadius: 8,
              fontWeight: 700,
            }}
          >
            ✉️ Email Order ({count})
          </button>
        </div>
      </form>

      {/* Tiny preview of the email body (first few lines) */}
      {items.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer" }}>Preview first few lines</summary>
          <pre style={{ whiteSpace: "pre-wrap", background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #eee" }}>
{previewLines.join("\n")}
          </pre>
        </details>
      )}
    </main>
  );
}
