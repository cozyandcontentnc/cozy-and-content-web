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
  } catch {
    return null;
  }
}

export default function ScanPage() {
  const videoRef = useRef(null);
  const [uid, setUid] = useState(null);

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Tap Start to enable the camera");
  const [lastCode, setLastCode] = useState("");
  const lastScanRef = useRef({ code: "", t: 0 });

  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [isSecureContext, setIsSecureContext] = useState(true);

  // ZXing reader with hints (restrict to common book/retail formats)
  const zxingRef = useRef(null);
  if (!zxingRef.current) {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, // most ISBNs (978/979)
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      // (We can add CODE_128 etc., but restricting reduces false positives)
    ]);
    // timeBetweenScansMillis to avoid event flood
    zxingRef.current = new BrowserMultiFormatReader(hints, 400);
  }

  // Native detector (if available)
  const detectorRef = useRef(null);
  const rafRef = useRef(null); // rAF loop for native detector

  useEffect(() => {
    if (typeof window !== "undefined") {
      const proto = window.location?.protocol || "";
      const host = window.location?.hostname || "";
      const https = proto === "https:";
      const isLocal = host === "localhost" || host === "127.0.0.1";
      setIsSecureContext(https || isLocal);
    }
  }, []);

  // Auth
  useEffect(() => {
    let active = true;
    (async () => {
      const u = await ensureAuth();
      if (active) setUid(u?.uid || null);
    })();
    return () => { active = false; };
  }, []);

  // Get devices list (labels only after permission granted)
  async function refreshDevices() {
    try {
      const list = await BrowserMultiFormatReader.listVideoInputDevices();
      setDevices(list);
      // prefer a "back" camera if present
      const back =
        list.find(d =>
          (d.label || "").toLowerCase().includes("back") ||
          (d.label || "").toLowerCase().includes("rear") ||
          (d.label || "").toLowerCase().includes("environment")
        ) || list[0];
      if (back) setDeviceId(prev => prev || back.deviceId);
    } catch (e) {
      console.warn("Could not enumerate devices:", e);
    }
  }

  function stopStreams() {
    try { zxingRef.current?.reset(); } catch {}
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
  }

  async function startScanner() {
    if (running) return;
    setStatus("Starting camera…");

    try {
      // getUserMedia first (grants permission; reveals device labels)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: deviceId ? undefined : { ideal: "environment" },
          // Hints — not widely supported but harmless:
          // advanced: [{ focusMode: "continuous" }]
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }

      // refresh list now that labels should be available
      await refreshDevices();

      // Prefer Native BarcodeDetector if available
      const NativeDetector = (globalThis).BarcodeDetector;
      if (NativeDetector) {
        // Init detector with common formats
        try {
          detectorRef.current = new NativeDetector({
            formats: [
              "ean_13", "ean_8", "upc_a", "upc_e",
              // optional extras:
              // "code_128", "code_39", "qr_code"
            ],
          });
        } catch {
          detectorRef.current = null;
        }
      }

      if (detectorRef.current) {
        setStatus("Point camera at a barcode");
        setRunning(true);
        // rAF loop — detect on each frame (throttled)
        const loop = async () => {
          if (!detectorRef.current || !videoRef.current) return;
          try {
            const results = await detectorRef.current.detect(videoRef.current);
            if (results && results.length) {
              const raw = results[0].rawValue || results[0].rawValue?.[0] || "";
              handleCode(raw);
            }
          } catch (e) {
            // ignore frame errors; continue
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } else {
        // Fallback to ZXing
        setStatus("Point camera at a barcode");
        await zxingRef.current.decodeFromVideoDevice(
          deviceId || undefined,
          videoRef.current,
          (result /*, err */) => {
            if (!result) return;
            handleCode(result.getText());
          }
        );
        setRunning(true);
      }
    } catch (err) {
      console.error(err);
      setStatus("Camera access denied or unavailable.");
      setRunning(false);
    }
  }

  function handleCode(raw) {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return;

    setLastCode(digits);
    const now = Date.now();
    if (lastScanRef.current.code === digits && now - lastScanRef.current.t < 1200) return;
    lastScanRef.current = { code: digits, t: now };

    // Heuristic: only consider likely ISBN/EAN/UPC lengths
    if (![8, 12, 13].includes(digits.length)) return;

    saveBook(digits);
  }

  async function saveBook(digits) {
    setStatus("Looking up…");
    const book = await lookupBook(digits);
    if (!book) { setStatus("Not found"); return; }
    if (!uid) { setStatus("Not signed in."); return; }

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

  function stopScanner() {
    stopStreams();
    setRunning(false);
    setStatus("Scanner stopped");
  }

  // Clean up on unmount
  useEffect(() => {
    refreshDevices(); // initial (labels may be blank until permission)
    return () => { stopScanner(); };
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
        {/* Camera picker (shows after permission for labeled devices) */}
        {devices.length > 1 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 14, opacity: 0.8 }}>Camera:</label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #ccc" }}
            >
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera"}</option>
              ))}
            </select>
            <button className="cc-btn-outline" onClick={() => { stopScanner(); startScanner(); }}>
              Switch
            </button>
          </div>
        )}

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

      {/* Manual fallback (helpful while testing) */}
      <div className="cc-card" style={{ marginTop: 12 }}>
        <ManualEntry onSubmit={(code) => handleCode(code)} />
      </div>
    </main>
  );
}

// Simple manual ISBN/UPC entry for debugging
function ManualEntry({ onSubmit }) {
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(code.trim()); }}
      style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Type ISBN/UPC to test"
        inputMode="numeric"
        pattern="[0-9]*"
        style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", width: 220 }}
      />
      <button className="cc-btn-outline" type="submit">Add</button>
    </form>
  );
}
