// src/app/scan/page.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { ensureAuth, db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { addItem, createList } from "@/lib/wishlists";

async function lookupBook(isbn) {
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  const j = await r.json();
  const info = j.items?.[0]?.volumeInfo;
  if (!info) return null;
  return {
    isbn,
    title: info.title || "Unknown",
    authors: info.authors || [],
    coverUrl: info.imageLinks?.thumbnail || "",
  };
}

export default function Page() {
  const videoRef = useRef(null);
  const [last, setLast] = useState("");
  const [status, setStatus] = useState("");
  const [reader] = useState(() => new BrowserMultiFormatReader());

  const [uid, setUid] = useState(null);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);

  // book details (prefilled after lookup)
  const [pendingBook, setPendingBook] = useState(null); // { isbn, title, authors[], coverUrl }

  // Init auth + subscribe to user's lists
  useEffect(() => {
    let stopLists = null;
    (async () => {
      const user = await ensureAuth();
      if (!user?.uid) return;
      setUid(user.uid);

      stopLists = onSnapshot(
        collection(db, "users", user.uid, "wishlists"),
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data()) }));
          setLists(arr);
          if (!selectedListId && arr[0]) setSelectedListId(arr[0].id);
        }
      );
    })();
    return () => { if (stopLists) stopLists(); };
  }, [selectedListId]);

  // Scanner
  useEffect(() => {
    let stopped = false;
    ensureAuth(); // keep your existing pattern

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const backCam =
          devices.find((d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear")
          ) || devices[0];

        await reader.decodeFromVideoDevice(backCam?.deviceId, videoRef.current, async (result) => {
          if (stopped || !result) return;
          const digits = result.getText().replace(/\D/g, "");
          setLast(digits);
          if (digits.length < 10) return;

          setStatus("Looking up…");
          const book = await lookupBook(digits);
          if (!book) { setStatus("Not found"); return; }

          // Do NOT auto-add; show add-to-list UI
          setPendingBook(book);
          setStatus("Ready to add");
        });
      } catch (err) {
        console.error(err);
        setStatus("Camera access denied or unavailable.");
      }
    })();

    return () => {
      try { reader.reset(); } catch {}
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [reader]);

  async function handleCreateList() {
    if (!uid) return;
    const name = prompt("List name:", `Visit — ${new Date().toLocaleDateString()}`);
    if (!name) return;
    const id = await createList(uid, name);
    setSelectedListId(id);
  }

  async function handleAddToList() {
    if (!uid || !selectedListId || !pendingBook) return;
    await addItem(uid, selectedListId, {
      isbn: pendingBook.isbn,
      title: pendingBook.title,
      author: pendingBook.authors?.[0] || "", // single author field for now
      image: pendingBook.coverUrl,
    });
    setStatus(`Added: ${pendingBook.title}`);
    setPendingBook(null);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 760, margin: "0 auto" }}>
      {/* Header with Back/Home */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin:0 }}>Scan a Book</h1>
        <a className="cc-btn-outline" href="/">Home</a>
      </div>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: "100%", maxWidth: 540, borderRadius: 12, background: "#000" }}
      />

      <p style={{ marginTop: 12 }}>Last code: <strong>{last || "—"}</strong></p>
      <p style={{ marginTop: 6, color: "#555" }}>{status}</p>

      {/* Add-to-list UI */}
      {pendingBook && (
        <div className="cc-card" style={{ marginTop: 12, display:"grid", gap:8 }}>
          <div style={{ fontWeight:700 }}>{pendingBook.title}</div>
          {pendingBook.authors?.length ? <div style={{ opacity:.8 }}>{pendingBook.authors.join(", ")}</div> : null}
          {pendingBook.isbn ? <div style={{ fontFamily:"monospace", fontSize:12 }}>ISBN: {pendingBook.isbn}</div> : null}

          <div>
            <label style={{ fontSize:12, opacity:.8, display:"block", marginBottom:6 }}>Add to list:</label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {lists.map((l) => (
                <button
                  key={l.id}
                  className="cc-btn-outline"
                  style={{ borderColor: l.id === selectedListId ? "var(--cc-accent)" : "var(--cc-border)" }}
                  onClick={() => setSelectedListId(l.id)}
                >
                  {l.name}
                </button>
              ))}
              <button className="cc-btn-outline" onClick={handleCreateList}>+ New list</button>
            </div>
          </div>

          <button className="cc-btn" onClick={handleAddToList}>Add to List</button>
        </div>
      )}
    </main>
  );
}
