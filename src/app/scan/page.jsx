// src/app/scan/page.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { ensureAuth, db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { addItem, createList } from "@/lib/wishlists";

async function lookupBook(isbn) {
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const j = await r.json();
    const info = j.items?.[0]?.volumeInfo;
    if (!info) return null;
    return {
      isbn,
      title: info.title || "Unknown",
      author: (info.authors && info.authors[0]) || "",
      image: info.imageLinks?.thumbnail || "",
    };
  } catch {
    return null;
  }
}

export default function Page() {
  const videoRef = useRef(null);
  const [reader] = useState(() => new BrowserMultiFormatReader());

  const [uid, setUid] = useState(null);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);

  const [last, setLast] = useState("");      // last scanned digits (display)
  const [status, setStatus] = useState("");  // status line
  const [busy, setBusy] = useState(false);   // debounce while adding
  const lastScanRef = useRef({ code: "", ts: 0 });

  // 1) Auth + subscribe to user's lists
  useEffect(() => {
    let stopLists = null;
    (async () => {
      const user = await ensureAuth();
      if (!user?.uid) return;
      setUid(user.uid);

      const qRef = query(
        collection(db, "users", user.uid, "wishlists"),
        orderBy("updatedAt", "desc")
      );
      stopLists = onSnapshot(qRef, (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data()) }));
        setLists(arr);
        if (!selectedListId && arr[0]) setSelectedListId(arr[0].id);
      });
    })();
    return () => { if (stopLists) stopLists(); };
  }, [selectedListId]);

  // 2) Scanner setup (no NotFoundException import)
  useEffect(() => {
    let stopped = false;
    let localControls = null;

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
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment")
          ) || devices[0];

        localControls = await reader.decodeFromVideoDevice(
          backCam?.deviceId,
          videoRef.current,
          async (result /*, err */) => {
            if (stopped || !result) return;

            // Normalize to digits (ISBN/EAN)
            const digits = result.getText().replace(/\D/g, "");
            if (!digits) return;

            // Always show the last scanned code
            setLast(digits);

            // Debounce duplicate reads within 1.5s
            const now = Date.now();
            if (lastScanRef.current.code === digits && now - lastScanRef.current.ts < 1500) {
              return;
            }
            lastScanRef.current = { code: digits, ts: now };

            // Only continue if not already adding
            if (busy) return;
            setBusy(true);
            setStatus("Looking up…");

            // 3) Lookup book
            const book = await lookupBook(digits);
            if (!book) {
              setStatus("Not found");
              setBusy(false);
              return;
            }

            // 4) Ensure we have an auth UID
            const user = await ensureAuth();
            if (!user?.uid) {
              setStatus("Not signed in.");
              setBusy(false);
              return;
            }

            // 5) Ensure a target list exists (auto-create if none)
            let targetListId = selectedListId;
            if (!targetListId) {
              const name = `Visit — ${new Date().toLocaleDateString()}`;
              setStatus("Creating a list…");
              targetListId = await createList(user.uid, name);
              setSelectedListId(targetListId);
            }

            // 6) Add to list
            try {
              await addItem(user.uid, targetListId, book);
              setStatus(`Added: ${book.title}`);
            } catch (e) {
              console.error(e);
              setStatus("Failed to add. Check rules/connection.");
            } finally {
              setBusy(false);
            }
          }
        );
      } catch (err) {
        console.error(err);
        setStatus("Camera access denied or unavailable.");
      }
    })();

    return () => {
      try { localControls && localControls.stop(); } catch {}
      try { reader && reader.reset(); } catch {}
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [reader, selectedListId, busy]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 760, margin: "0 auto" }}>
      {/* Back/Home */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Scan a Book</h1>
        <a className="cc-btn-outline" href="/">Home</a>
      </div>

      {/* Camera */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: "100%", maxWidth: 540, borderRadius: 12, background: "#000" }}
      />

      {/* Status */}
      <p style={{ marginTop: 12 }}>Last code: <strong>{last || "—"}</strong></p>
      <p style={{ marginTop: 6, color: "#555" }}>{status}</p>

      {/* Current list indicator */}
      <div className="cc-card" style={{ marginTop: 12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:12, opacity:.8 }}>Active list:</span>
          <strong>
            {lists.find(l => l.id === selectedListId)?.name || (lists[0]?.name ?? "Will create when you scan")}
          </strong>
        </div>
      </div>
    </main>
  );
}
