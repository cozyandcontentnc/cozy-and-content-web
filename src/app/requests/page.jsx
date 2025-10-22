// app/requests/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ensureAuth, db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

const SHOP_EMAIL = "cozyandcontentbooks@gmail.com";

export default function RequestsPage() {
  const [uid, setUid] = useState(null);
  const [name, setName] = useState("A Cozy Shopper");
  const [email, setEmail] = useState("");
  const [requestedBooks, setRequestedBooks] = useState(null); // null = loading
  const [selectedBooks, setSelectedBooks] = useState([]);

  // Auth + live subscription
  useEffect(() => {
    let unsub = null;

    (async () => {
      const user = await ensureAuth({ allowAnonymous: true });
      if (!user?.uid) return;
      setUid(user.uid);
      if (user.displayName) setName(user.displayName);
      if (user.email) setEmail(user.email);

      // Live updates; newest first. We'll filter status client-side to avoid index requirements.
      const qRef = query(
        collection(db, "users", user.uid, "bookRequests"),
        orderBy("createdAt", "desc")
      );

      unsub = onSnapshot(qRef, (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        const onlyRequested = rows.filter((r) => (r.status || "requested") === "requested");
        setRequestedBooks(onlyRequested);
        // Keep selection if items still present
        setSelectedBooks((prev) => prev.filter((id) => onlyRequested.some((r) => r.id === id)));
      });
    })();

    return () => { if (unsub) unsub(); };
  }, []);

  const selectedRows = useMemo(
    () => (requestedBooks || []).filter((b) => selectedBooks.includes(b.id)),
    [requestedBooks, selectedBooks]
  );

  function handleCheckboxChange(e, bookId) {
    setSelectedBooks((prev) =>
      e.target.checked ? [...prev, bookId] : prev.filter((id) => id !== bookId)
    );
  }

  function buildMailto({ name, email, items }) {
    const subject = encodeURIComponent("Wishlist Order Request");
    const lines = [];
    lines.push(`Name: ${name || ""}`);
    lines.push(`Email: ${email || ""}`);
    lines.push("");
    lines.push("I'd like to order the following titles:");
    lines.push("");
    items.forEach((b, idx) => {
      const author =
        b.author || (Array.isArray(b.authors) ? b.authors.join(", ") : "");
      lines.push(
        `${idx + 1}. ${b.title || "Untitled"}${author ? " — " + author : ""}${
          b.isbn ? " (ISBN: " + b.isbn + ")" : ""
        }`
      );
    });
    lines.push("");
    lines.push("Notes:");
    const body = encodeURIComponent(lines.join("\n"));
    return `mailto:${SHOP_EMAIL}?subject=${subject}&body=${body}`;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!selectedRows.length) {
      alert("Select at least one book to order.");
      return;
    }
    const href = buildMailto({ name, email, items: selectedRows });
    window.location.href = href; // open the email draft
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <Link href="/" className="cc-btn-outline">← Home</Link>
        <h1 style={{ margin: 0 }}>Request a Book</h1>
      </div>

      {!uid ? (
        <div className="cc-card">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="name" style={{ display: "block", marginBottom: 6 }}>
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              style={{ padding: "8px", width: "100%" }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="email" style={{ display: "block", marginBottom: 6 }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              required
              style={{ padding: "8px", width: "100%" }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 6 }}>Select Books to Order</label>

            {requestedBooks === null ? (
              <p>Loading…</p>
            ) : requestedBooks.length === 0 ? (
              <p>No books requested yet.</p>
            ) : (
              requestedBooks.map((book) => (
                <div key={book.id} style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    id={`book-${book.id}`}
                    onChange={(e) => handleCheckboxChange(e, book.id)}
                    checked={selectedBooks.includes(book.id)}
                    style={{ marginRight: 8 }}
                  />
                  <label htmlFor={`book-${book.id}`} style={{ fontSize: 14 }}>
                    {book.title} {book.author ? `by ${book.author}` : ""}
                    {book.isbn ? ` — ISBN: ${book.isbn}` : ""}
                  </label>
                </div>
              ))
            )}
          </div>

          <button
            type="submit"
            style={{
              padding: "10px 20px",
              backgroundColor: "#0070f3",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
            disabled={!requestedBooks || requestedBooks.length === 0}
          >
            Submit Order
          </button>
        </form>
      )}
    </main>
  );
}
