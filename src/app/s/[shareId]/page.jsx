"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";

const SHOP_EMAIL = "cozyandcontentbooks@gmail.com";

export default function PublicSharePage() {
  const { shareId } = useParams(); // /s/:shareId
  const search = useSearchParams();
  const focusItem = search.get("item"); // optional ?item=abc (preselect + outline)
  const router = useRouter();

  const [mapping, setMapping] = useState(null); // { ownerUid, listId, listName? }
  const [items, setItems] = useState(null);     // null = loading, [] = empty
  const [status, setStatus] = useState("Loading…");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [selected, setSelected] = useState([]);
  const [copied, setCopied] = useState(false);
  const listRef = useRef(null);

  const focusedIndex = useMemo(() => {
    if (!items || !focusItem) return -1;
    return items.findIndex((b) => b.id === focusItem);
  }, [items, focusItem]);

  // Resolve mapping: shares/{shareId} -> { ownerUid, listId, listName? }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sref = doc(db, "shares", shareId);
        const ssnap = await getDoc(sref);
        if (!ssnap.exists()) {
          if (alive) {
            setStatus("This shared wishlist link is no longer available.");
            setItems([]); // prevent spinner
          }
          return;
        }
        const map = { id: ssnap.id, ...(ssnap.data() || {}) };
        if (alive) setMapping(map);

        // Load denormalized public items first: shares/{shareId}/items
        let loaded = [];
        try {
          const pubQ = query(
            collection(db, "shares", shareId, "items"),
            orderBy("addedAt", "desc")
          );
          const pubSnap = await getDocs(pubQ);
          loaded = pubSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        } catch {
          // ignore; we'll try the owner path
        }

        // Fallback to owner path if nothing denormalized
        if (!loaded.length && map.ownerUid && map.listId) {
          try {
            const ownerQ = query(
              collection(db, "users", map.ownerUid, "wishlists", map.listId, "items"),
              orderBy("addedAt", "desc")
            );
            const ownerSnap = await getDocs(ownerQ); // may fail if rules block it
            loaded = ownerSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          } catch {
            // cross-user read blocked
          }
        }

        if (alive) {
          setItems(loaded);
          setStatus(loaded.length ? "" : "No books on this wishlist yet.");
          // Preselect ?item=...
          if (loaded.length && focusItem && loaded.some((b) => b.id === focusItem)) {
            setSelected([focusItem]);
            // scroll a touch after paint
            requestAnimationFrame(() => {
              const el = document.getElementById(`book-row-${focusItem}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            });
          }
        }
      } catch (e) {
        console.error(e);
        if (alive) {
          setStatus("We couldn’t open that share. Please try again.");
          setItems([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [shareId, focusItem, router]);

  function toggleOne(id, checked) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  const allChecked = items?.length && selected.length === items.length;
  function toggleAll(checked) {
    if (!items?.length) return;
    setSelected(checked ? items.map((b) => b.id) : []);
  }

  const selectedRows = useMemo(
    () => (items || []).filter((b) => selected.includes(b.id)),
    [items, selected]
  );

  function coverFor(b) {
    return b.image || b.coverUrl || b.thumbnail || "";
  }

  function buildMailto({ name, email, listName, items }) {
    const subject = encodeURIComponent(
      `Wishlist Order Request${listName ? ` — ${listName}` : ""}`
    );
    const lines = [];
    lines.push(`Name: ${name || ""}`);
    lines.push(`Email: ${email || ""}`);
    lines.push("");
    lines.push("I'd like to order the following titles:");
    lines.push("");

    items.forEach((b, idx) => {
      const author =
        b.author || (Array.isArray(b.authors) ? b.authors.join(", ") : "");
      const title = b.title || "Untitled";
      const isbn = b.isbn ? ` (ISBN: ${b.isbn})` : "";
      lines.push(`${idx + 1}. ${title}${author ? " — " + author : ""}${isbn}`);
    });

    lines.push("");
    lines.push("Notes:");

    const body = encodeURIComponent(lines.join("\n"));
    return `mailto:${SHOP_EMAIL}?subject=${subject}&body=${body}`;
  }

  function onEmailSelected(e) {
    e.preventDefault();
    if (!selectedRows.length) {
      alert("Select at least one book to email.");
      return;
    }
    const href = buildMailto({
      name,
      email,
      listName: mapping?.listName,
      items: selectedRows,
    });
    window.location.href = href;
  }

  async function onCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select + prompt (very old browsers)
      const ok = window.prompt("Copy this link:", window.location.href);
      if (typeof ok === "string") setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Link href="/" className="cc-btn-outline">← Home</Link>
        <h1 style={{ margin: 0, flex: "1 1 auto" }}>
          {mapping?.listName ? `Requests — ${mapping.listName}` : "Requests"}
        </h1>
        <button
          type="button"
          onClick={onCopyLink}
          className="cc-btn"
          style={{
            padding: "8px 12px",
            backgroundColor: "#fff",
            color: "#365c4a",
            border: "2px solid #365c4a",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          🔗 Copy link
        </button>
      </div>

      {copied && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 20,
            background: "#2d6a4f",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            zIndex: 50,
            fontWeight: 700,
          }}
        >
          Link copied!
        </div>
      )}

      {status && (
        <div className="cc-card" style={{ marginBottom: 12 }}>
          {status}
        </div>
      )}

      {/* Contact block (optional but handy for your inbox) */}
      <form onSubmit={onEmailSelected}>
        <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
          <div>
            <label htmlFor="name" style={{ display: "block", marginBottom: 6 }}>Your Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div>
            <label htmlFor="email" style={{ display: "block", marginBottom: 6 }}>Your Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: "100%", padding: 8 }}
            />
          </div>
        </div>

        {/* Bulk controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={!!allChecked}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            <span>Select all</span>
          </label>
          <span style={{ color: "#666" }}>
            {selected.length} selected {items?.length ? `of ${items.length}` : ""}
          </span>
        </div>

        {/* Items */}
        <div ref={listRef} style={{ display: "grid", gap: 10 }}>
          {(items || []).map((b, i) => {
            const id = b.id;
            const checked = selected.includes(id);
            const author =
              b.author || (Array.isArray(b.authors) ? b.authors.join(", ") : "");
            const outlined = i === focusedIndex;
            const cover = coverFor(b);

            return (
              <div
                key={id}
                id={`book-row-${id}`}
                className="cc-card"
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 64px 1fr",
                  gap: 10,
                  alignItems: "center",
                  outline: outlined ? "2px solid var(--cc-accent, #365c4a)" : "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleOne(id, e.target.checked)}
                  aria-label={`Select ${b.title || "Untitled"}`}
                />

                {/* Jacket thumbnail */}
                {cover ? (
                  <img
                    src={cover}
                    alt={b.title || "Book cover"}
                    width={64}
                    height={96}
                    loading="lazy"
                    style={{
                      width: 64,
                      height: 96,
                      objectFit: "cover",
                      borderRadius: 6,
                      background: "#f4f1ea",
                      border: "1px solid #e7e0d5",
                    }}
                    onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                  />
                ) : (
                  <div
                    aria-hidden
                    style={{
                      width: 64,
                      height: 96,
                      borderRadius: 6,
                      background: "linear-gradient(180deg,#f1ede5,#e8e1d6)",
                      border: "1px solid #e7e0d5",
                      display: "grid",
                      placeItems: "center",
                      color: "#9c8f7a",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    No Cover
                  </div>
                )}

                <div>
                  <div style={{ fontWeight: 700 }}>
                    {b.title || "Untitled"}
                  </div>
                  {author && (
                    <div style={{ opacity: 0.8 }}>{author}</div>
                  )}
                  {b.isbn && (
                    <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                      ISBN: {b.isbn}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            type="submit"
            disabled={!items || items.length === 0 || selected.length === 0}
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
            Email Selected to Cozy & Content
          </button>
        </div>
      </form>
    </main>
  );
}
