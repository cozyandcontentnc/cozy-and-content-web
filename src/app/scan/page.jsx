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
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const zxingRef = useRef(null);

  const [uid, setUid] = useState(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Tap Start to enable the camera");
  const [lastCode, setLastCode] = useState("");
  const [firestoreError, setFirestoreError] = useState("");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");

  const lastScanRef = useRef({ code: "", t: 0 });

  // Build ZXing reader w/ format hints (ISBNs are EAN-13, sometimes UPC-A)
  if (!zxingRef.current) {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    zxingRef.current = new BrowserMultiFormatReader(hints, 250);
  }

  // Ensure we’re signed in (allow anonymous for scan-and-go)
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth({ allowAnonymous: true });
      if (active) setUid(user?.uid || null);
    })();
    return () => { active = false; };
  }, []);

  // Enumerate cameras (labels appear after permission is granted)
  async function refreshDevices() {
    try {
      const list = await BrowserMultiFormatReader.listVideoInputDevices();
      setDevices(list);
      const back =
        list.find((d) =>
          (d.label || "").toLowerCase().includes("back") ||
          (d.label || "").toLowerCase().includes("rear") ||
          (d.label || "").toLowerCase().includes("environment")
        ) || list[0];
      if (back && !deviceId) setDeviceId(back.deviceId);
    } catch (e) {
      console.warn("Could not list cameras:", e);
    }
  }

  function stopStreams() {
    try { zxingRef.current?.reset(); } catch {}
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  async function startScanner() {
    if (running) return;
    setStatus("Starting camera…");
    setFirestoreError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: deviceId ? undefined : { ideal: "environment" },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }

      await refreshDevices();

      // Try native BarcodeDetector first
      const NativeDetector = globalThis.BarcodeDetector;
      if (NativeDetector) {
        try {
          detectorRef.current = new NativeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"], // allow a few extras
          });
        } catch {
          detectorRef.current = null;
        }
      }

      if (detectorRef.current) {
        setStatus("Point barcode inside the frame");
        setRunning(true);

        const loop = async () => {
          if (!detectorRef.current || !videoRef.current) return;
          try {
            const results = await detectorRef.current.detect(videoRef.current);
            if (results && results.length) {
              const raw = results[0]?.rawValue || "";
              if (raw) handleDetected(raw);
            }
          } catch (e) {
            // ignore frame errors
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } else {
        // Fallback to ZXing stream callback
        await zxingRef.current.decodeFromVideoDevice(
          deviceId || undefined,
          videoRef.current,
          (result /*, err */) => {
            if (!result) return;
            handleDetected(result.getText());
          }
        );
        setStatus("Point barcode inside the frame");
        setRunning(true);
      }
    } catch (err) {
      console.error("Camera failed:", err);
      setStatus("Camera access denied or unavailable.");
      setRunning(false);
    }
  }

  function stopScanner() {
    stopStreams();
    setRunning(false);
    setStatus("Scanner stopped");
  }

  function handleDetected(raw) {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return;

    // Debounce repeats for 1.2s
    const now = Date.now();
    if (lastScanRef.current.code === digits && now - lastScanRef.current.t < 1200) return;
    lastScanRef.current = { code: digits, t: now };

    // Likely EAN/UPC lengths
    if (![8, 12, 13].includes(digits.length)) return;

    setLastCode(digits);
    saveBook(digits);
  }

  async function saveBook(isbnDigits) {
    setStatus("Looking up…");
    setFirestoreError("");

    const book = await lookupBook(isbnDigits);
    if (!book) { setStatus("Not found"); return; }

    if (!uid) {
      setStatus("Not signed in.");
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
    } catch (e) {
      console.error("Firestore write failed:", e);
      setStatus("Failed to save to Firestore.");
      setFirestoreError(e?.code || String(e));
    }
  }

  // Clean up on unmount
  useEffect(() => {
    return () => { stopScanner(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual entry (debug)
  const [manual, setManual] = useState("");
  function onManualSubmit(e) {
    e.preventDefault();
    const digits = manual.replace(/\D/g, "");
    if (digits) handleDetected(digits);
  }

  return (
    <main style={{ padding: 16, maxWidth: 760, margin: "0 auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Scan a Book</h1>
        <a className="cc-btn-outline" href="/">Home</a>
      </div>

      <div className="cc-card" style={{ display: "grid", gap: 8 }}>
        {/* Camera picker if multiple */}
        {devices.length > 1 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 14, opacity: 0.8 }}>Camera:</label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #ccc" }}
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Camera"}
                </option>
              ))}
            </select>
            <button className="cc-btn-outline" onClick={() => { stopScanner(); startScanner(); }}>
              Switch
            </button>
          </div>
        )}

        {/* Video with overlay guide */}
        <div style={{ position: "relative", width: "100%", display: "grid", placeItems: "center" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "100%",
              aspectRatio: "3 / 4",
              maxWidth: 540,
              borderRadius: 12,
              background: "#000",
              display: "block",
            }}
          />

          {/* Finder frame: corners + animated scan line */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "80%",
                maxWidth: 420,
              }}
            >
              {/* The box */}
              <div
                style={{
                  width: "100%",
                  height: 220,
                  margin: "0 auto",
                  borderRadius: 12,
                  boxShadow: "0 0 0 20000px rgba(0,0,0,0.4) inset",
                  border: "2px solid rgba(255,255,255,0.85)",
                }}
              />
              {/* Corner accents */}
              {["tl","tr","bl","br"].map((pos) => (
                <span
                  key={pos}
                  style={{
                    position: "absolute",
                    width: 26,
                    height: 26,
                    borderColor: "rgba(255,255,255,0.95)",
                    ...(pos === "tl" && { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderStyle: "solid" }),
                    ...(pos === "tr" && { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderStyle: "solid" }),
                    ...(pos === "bl" && { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderStyle: "solid" }),
                    ...(pos === "br" && { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderStyle: "solid" }),
                  }}
                />
              ))}
              {/* Animated scan line */}
              <span
                style={{
                  position: "absolute",
                  left: 0, right: 0,
                  top: 0,
                  height: 2,
                  background: "rgba(207,172,120,0.95)", // warm accent
                  boxShadow: "0 0 12px rgba(207,172,120,0.9)",
                  animation: "ccScanLine 1400ms linear infinite",
                }}
              />
            </div>
          </div>
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
        <div style={{ color: "#666", fontSize: 12 }}>
          Tip: Hold ~5–8 inches away, center barcode in the box, good lighting helps.
        </div>
      </div>

      {/* Manual fallback for quick testing */}
      <div className="cc-card" style={{ marginTop: 12 }}>
        <form onSubmit={onManualSubmit} style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Type ISBN/UPC"
            inputMode="numeric"
            pattern="[0-9]*"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", width: 240 }}
          />
          <button className="cc-btn-outline" type="submit">Add Manually</button>
        </form>
      </div>

      {/* Scoped animations */}
      <style jsx>{`
        @keyframes ccScanLine {
          0%   { transform: translateY(0); opacity: 0.3; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(218px); opacity: 0.3; }
        }
      `}</style>
    </main>
  );
}
