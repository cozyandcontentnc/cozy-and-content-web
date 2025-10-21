"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
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
  } catch (e) {
    console.error("Lookup failed:", e);
    return null;
  }
}

export default function ScanPage() {
  const videoRef = useRef(null);
  const [uid, setUid] = useState(null);

  // UI state
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Tap Start to enable the camera");
  const [lastCode, setLastCode] = useState("");
  const [firestoreError, setFirestoreError] = useState("");
  const [isSecureContext, setIsSecureContext] = useState(true);

  // Flash overlay state (fallback / also nice UI affordance)
  const [flash, setFlash] = useState(null); // null | "detect" | "save"
  const flashTimerRef = useRef(null);

  function triggerFlash(kind = "detect") {
    // kind: "detect" (white) or "save" (green)
    setFlash(kind);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 120); // quick flash
  }

  function cleanupFlash() {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash(null);
  }

  // ZXing with hints (EAN/UPC only → better accuracy for books)
  const zxingRef = useRef(null);
  if (!zxingRef.current) {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, // ISBN (978/979)
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    zxingRef.current = new BrowserMultiFormatReader(hints, 300);
  }

  const lastScanRef = useRef({ code: "", t: 0 });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const proto = window.location?.protocol || "";
      const host = window.location?.hostname || "";
      const https = proto === "https:";
      const isLocal = host === "localhost" || host === "127.0.0.1";
      setIsSecureContext(https || isLocal);
    }
  }, []);

  // Ensure we’re signed in
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth({ allowAnonymous: true }); // allow anon for scan-and-go
      if (active) setUid(user?.uid || null);
    })();
    return () => { active = false; };
  }, []);

  function vibrate(ms = 50) {
    try {
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(ms);
        return true;
      }
    } catch {}
    return false;
  }

  function onFeedbackDetect() {
    // Vibrate briefly OR flash if not available
    if (!vibrate(35)) triggerFlash("detect");
  }

  function onFeedbackSaved() {
    // Stronger haptic OR green flash if not available
    if (!vibrate(90)) triggerFlash("save");
  }

  function handleDetected(raw) {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return;

    setLastCode(digits);

    const now = Date.now();
    if (lastScanRef.current.code === digits && now - lastScanRef.current.t < 1200) return;
    lastScanRef.current = { code: digits, t: now };

    // Likely barcode lengths for books/retail
    if (![8, 12, 13].includes(digits.length)) return;

    onFeedbackDetect(); // 🔔 feedback on detection
    saveBook(digits);
  }

  async function saveBook(isbnDigits) {
    setFirestoreError("");
    setStatus("Looking up…");

    const book = await lookupBook(isbnDigits);
    if (!book) { setStatus("Not found"); return; }

    if (!uid) {
      setStatus("Not signed in. Please log in.");
      setFirestoreError("auth/no-user");
      return;
    }

    try {
      await setDoc(
        doc(db, "wishlists", uid, "items", book.isbn),
        { ...book, addedAt: serverTimestamp() },
        { merge: true }
      );
      setStatus(`Added: ${book.title}`);
      onFeedbackSaved(); // ✅ stronger feedback on successful save
    } catch (e) {
      console.error("Firestore write failed:", e);
      setStatus("Failed to save to Firestore.");
      setFirestoreError(e?.code || String(e));
    }
  }

  async function startScanner() {
    if (running) return;
    setStatus("Starting camera…");
    setFirestoreError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }

      await zxingRef.current.decodeFromVideoDevice(
        undefined, // let zxing pick based on facingMode
        videoRef.current,
        (result /*, err */) => {
          if (!result) return;
          handleDetected(result.getText());
        }
      );

      setRunning(true);
      setStatus("Point camera at a barcode");
    } catch (err) {
      console.error("Camera failed:", err);
      setStatus("Camera access denied or unavailable.");
      setRunning(false);
    }
  }

  function stopScanner() {
    try { zxingRef.current?.reset(); } catch {}
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    setRunning(false);
    setStatus("Scanner stopped");
    cleanupFlash();
  }

  useEffect(() => {
    return () => { stopScanner(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual entry for debugging
  const [manual, setManual] = useState("");
  async function testManualAdd(e) {
    e.preventDefault();
    const digits = manual.replace(/\D/g, "");
    if (!digits) return;
    handleDetected(digits);
  }

  return (
    <main style={{ padding: 16, maxWidth: 760, margin: "0 auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Scan a Book</h1>
        <a className="cc-btn-outline" href="/">Home</a>
      </div>

      <div className="cc-card" style={{ display: "grid", gap: 8 }}>
        {/* Video wrapper so we can position the flash overlay on top */}
        <div style={{ position: "relative", width: "100%" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "100%",
              aspectRatio: "3 / 4",
              maxWidth: 520,
              borderRadius: 12,
              background: "#000",
              display: "block",
              margin: "0 auto"
            }}
          />

          {/* Flash overlay (fallback and visual feedback) */}
          {flash && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                margin: "0 auto",
                maxWidth: 520,
                borderRadius: 12,
                pointerEvents: "none",
                // white for detect, green for save
                background: flash === "save"
                  ? "rgba(54, 92, 74, 0.35)"  // cozy green
                  : "rgba(255, 255, 255, 0.6)",
                animation: "ccFlash 140ms ease-out",
              }}
            />
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {!running ? (
            <button className="cc-btn" onClick={startScanner}>▶️ Start</button>
          ) : (
            <button className="cc-btn-outline" onClick={stopScanner}>⏹ Stop</button>
          )}
          <a className="cc-btn-outline" href="/scan">↻ Reset</a>
        </div>
      </div>

      <div className="cc-card" style={{ marginTop: 12, display: "grid", gap: 6 }}>
        <div>Last code: <strong>{lastCode || "—"}</strong></div>
        <div style={{ color: "#555" }}>{status}</div>
        {firestoreError && (
          <div style={{ color: "#a33", fontSize: 12 }}>
            Firestore error: <code>{firestoreError}</code>
          </div>
        )}
        {!isSecureContext && (
          <div style={{ color: "#a33", fontSize: 12 }}>
            Tip: On phones, the camera needs HTTPS (Vercel is OK). Plain LAN IPs won’t work.
          </div>
        )}
      </div>

      <div className="cc-card" style={{ marginTop: 12 }}>
        <form onSubmit={testManualAdd} style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Type ISBN/UPC to test saving"
            inputMode="numeric"
            pattern="[0-9]*"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", width: 240 }}
          />
          <button className="cc-btn-outline" type="submit">Add Manually</button>
        </form>
      </div>

      {/* Flash keyframes (scoped inline) */}
      <style jsx>{`
        @keyframes ccFlash {
          0%   { opacity: 0; }
          1%   { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </main>
  );
}
