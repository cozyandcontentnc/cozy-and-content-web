// src/app/scan/page.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { ensureAuth, db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
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
      author: Array.isArray(info.authors) ? info.authors[0] || "" : "",
      image: (info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail)) || "",
    };
  } catch (e) {
    console.warn("lookupBook error:", e);
    return null;
  }
}

export default function Page() {
  const videoRef = useRef(null);
  const [reader] = useState(() => new BrowserMultiFormatReader());

  const [uid, setUid] = useState(null);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);

  const selectedListIdRef = useRef(null);
  const busyRef = useRef(false);

  const [last, setLast] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => { selectedListIdRef.current = selectedListId; }, [selectedListId]);

  // Auth + subscribe to user's lists (run once)
  useEffect(() => {
    let stopLists = null;
    (async () => {
      const user = await ensureAuth();
      if (!user?.uid) return;
      setUid(user.uid);

      const qRef = query(collection(db, "users", user.uid, "wishlists"), orderBy("updatedAt", "desc"));
      stopLists = onSnapshot(qRef, (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data()) }));
        setLists(arr);
        if (!selectedListIdRef.current && arr[0]) {
          setSelectedListId(arr[0].id);
          selectedListIdRef.current = arr[0].id;
        }
      });
    })();
    return () => { if (stopLists) stopLists(); };
  }, []);

  // Scanner setup (run once)
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
            (d.label || "").toLowerCase().includes("back") ||
            (d.label || "").toLowerCase().includes("rear") ||
            (d.label || "").toLowerCase().includes("environment")
          ) || devices[0];

        localControls = await reader.decodeFromVideoDevice(
          backCam?.deviceId,
          videoRef.current,
          async (result /*, err */) => {
            if (stopped || !result) return;

            const digits = result.getText().replace(/\D/g, "");
            if (!digits) return;

            setLast((prev) => (prev === digits ? prev : digits));

            if (busyRef.current) return;
            busyRef.current = true;

            setStatus("Looking up…");
            let book = await lookupBook(digits);
            if (!book) {
              book = { isbn: digits, title: `Scanned ISBN ${digits}`, author: "", image: "" };
            }

            const user = await ensureAuth();
            if (!user?.uid) {
              setStatus("Not signed in.");
              busyRef.current = false;
              return;
            }

            let targetListId = selectedListIdRef.current;
            if (!targetListId) {
              const name = `Visit — ${new Date().toLocaleDateString()}`;
              setStatus("Creating a list…");
              try {
                targetListId = await createList(user.uid, name);
                setSelectedListId(targetListId);
                selectedListIdRef.current = targetListId;
              } catch (e) {
                console.error("createList failed:", e);
                setStatus("Could not create list. Check Firestore rules.");
                busyRef.current = false;
                return;
              }
            }

            try {
              await addItem(user.uid, targetListId, book);
              setStatus(`Added: ${book.title}`);
              console.log("Added to list", targetListId, book);
            } catch (e) {
              console.error("addItem failed:", e);
              setStatus("Failed to add. Check rules/connection.");
            } finally {
              setTimeout(() => { busyRef.current = false; }, 700);
            }
          }
        );
      } catch (err) {
        console.error("Camera error:", err);
        setStatus("Camera access denied or unavailable.");
      }
    })();

    return () => {
      stopped = true;
      try { localControls && localControls.stop(); } catch {}
      try { reader && reader.reset(); } catch {}
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [reader]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Scan a Book</h1>
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
