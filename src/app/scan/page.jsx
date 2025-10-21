// src/app/scan/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { ensureAuth, db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

async function lookupBook(isbn) {
  try {
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
  } catch {
    return null;
  }
}

export default function ScanPage() {
  const videoRef = useRef(null);
  const [reader] = useState(() => new BrowserMultiFormatReader());
  const [uid, setUid] = useState(null);

  const [lastCode, setLastCode] = useState("");
  const [status, setStatus] = useState("Tap Start to enable the camera");
  const [running, setRunning] = useState(false);
  const lastScanRef = useRef({ code: "", t: 0 });

  // client-only env flags (avoid `location` on server)
  const [isSecureContext, setIsSecureContext] = useState(true);

  useEffect(() => {
    // Determine HTTPS/localhost only on client
    if (typeof window !== "undefined") {
      const proto = window.location?.protocol || "";
      const host = window.location?.hostname || "";
      const https = proto === "https:";
      const isLocal = host === "localhost" || host === "127.0.0.1";
      setIsSecureContext(https || isLocal);
    }
  }, []);

  // Make sure we’re signed in before saving
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth();
      if (active) setUid(user?.uid || null);
    })();
    return () => { active = false; };
  }, []);

  async function startScanner() {
    if (running) return;
    setStatus("Starting camera…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }

      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const backCam =
        devices.find(d =>
          (d.label || "").toLowerCase().includes("back") ||
          (d.label || "").toLowerCase().includes("rear") ||
          (d.label || "").toLowerCase().includes("environment")
        ) || devices[0];

      await reader.decodeFromVideoDevice(
        backCam?.deviceId ?? undefined,
        videoRef.current,
        async (result /*, err */) => {
          if (!result) return;
          const raw = result.getText();
          const digits = (raw || "").replace(/\D/g, "");
          if (!digits) return;

          setLastCode(digits);

          const now = Date.now();
          if (lastScanRef.current.code === digits && now - lastScanRef.current.t < 1500) return;
          lastScanRef.current = { code: digits, t: now };

          setStatus("Looking up…");
          const book = await lookupBook(digits);
          if (!book) {
            setStatus("Not found");
            return;
          }

          if (!uid) {
            setStatus("Not signed in.");
            return;
          }

          try {
            await setDoc(
              doc(db, "wishlists", uid, "items", book.isbn),
              { ...book, addedAt: serverTimestamp() },
              { merge: true }
            );
            setStatus(`Added: ${book.title}`);
          } catch (e) {
            console.error(e);
            setStatus("Failed to save to Firestore.");
          }
        }
      );

      setRunning(true);
      setStatus("Point camera at a barcode");
    } catch (err) {
      console.error(err);
      setStatus("Camera access denied or unavailable.");
      setRunning(false);
    }
  }

  function stopScanner() {
    try { reader.reset(); } catch {}
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    setRunning(false);
    setStatus("Scanner stopped");
  }

  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: 16, maxWidth: 760, margin: "0 auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Scan a Book</h1>
        <a className="cc-btn-outline" href="/">Home</a>
      </div>

      <div className="cc-card" style={{ display: "grid", gap: 8 }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", aspectRatio: "3 / 4", maxWidth: 520, borderRadius: 12, background: "#000", margin: "0 auto" }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {!running ? (
            <button className="cc-btn" onClick={startScanner}>▶️ Start</button>
          ) : (
            <button className="cc-btn-outline" onClick={stopScanner}>⏹ Stop</button>
          )}
          <a className="cc-btn-outline" href="/scan">↻ Reset</a>
        </div>
      </div>

      <div className="cc-card" style={{ marginTop: 12, display: "grid", gap: 4 }}>
        <div>Last code: <strong>{lastCode || "—"}</strong></div>
        <div style={{ color: "#555" }}>{status}</div>
        {!isSecureContext && (
          <div style={{ color: "#a33", fontSize: 12 }}>
            Tip: On phones, the camera needs HTTPS (Vercel is fine). Plain LAN IPs won’t work.
          </div>
        )}
      </div>
    </main>
  );
}
