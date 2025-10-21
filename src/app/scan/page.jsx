"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { ensureAuth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

// --- Google Books lookup ---
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
  const rafRef = useRef(null);
  const detectorRef = useRef(null);      // native BarcodeDetector
  const zxingRef = useRef(null);         // ZXing fallback
  const canvasRef = useRef(null);        // offscreen ROI canvas for native detector

  const [uid, setUid] = useState(null);

  // Lists
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");

  // UI
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Tap Start to enable the camera");
  const [lastCode, setLastCode] = useState("");
  const [firestoreError, setFirestoreError] = useState("");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");

  // Finder box size (in CSS px, matches overlay)
  const FINDER_WIDTH = 320;
  const FINDER_HEIGHT = 140;

  // Debounce
  const lastScanRef = useRef({ code: "", t: 0 });

  // ZXing with EAN/UPC hints
  if (!zxingRef.current) {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    zxingRef.current = new BrowserMultiFormatReader(hints, 200);
  }

  // Auth (allow anonymous for scan & go)
  useEffect(() => {
    let active = true;
    (async () => {
      const user = await ensureAuth({ allowAnonymous: true });
      if (!active) return;
      setUid(user?.uid || null);
    })();
    return () => { active = false; };
  }, []);

  // Load lists & auto-create if needed
  useEffect(() => {
    if (!uid) return;

    const listsCol = collection(db, "users", uid, "wishlists");
    const qRef = query(listsCol, orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(qRef, async (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data()) }));
      setLists(arr);

      if (!arr.length) {
        setStatus("Creating your first wishlist…");
        try {
          const name = `Visit — ${new Date().toLocaleDateString()}`;
          const ref = await addDoc(listsCol, {
            name,
            isPublic: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setSelectedListId(ref.id);
          setStatus("List created. You can start scanning.");
        } catch {
          setStatus("Couldn’t create a wishlist.");
        }
        return;
      }

      if (!selectedListId) {
        setSelectedListId(arr[0].id);
      } else if (!arr.find((l) => l.id === selectedListId)) {
        setSelectedListId(arr[0].id);
      }
    });

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Enumerate cameras
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
    } catch {}
  }

  function stopStreams() {
    try { zxingRef.current?.reset(); } catch {}
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  // Try to enable continuous autofocus + mild zoom (if supported)
  async function tuneTrack(video) {
    try {
      const stream = video.srcObject;
      const track = stream?.getVideoTracks?.()[0];
      if (!track) return;
      const caps = track.getCapabilities?.() || {};
      const cons = track.getConstraints?.() || {};

      const newConstraints = {};

      // Ask for continuous focus if available
      if (caps.focusMode && caps.focusMode.includes("continuous")) {
        newConstraints.focusMode = "continuous";
      }
      // Mild zoom helps barcode clarity
      if (typeof caps.zoom === "number") {
        const target = Math.min(caps.zoom, 2.0); // up to 2x if available
        newConstraints.zoom = target;
      } else if (caps.zoom && caps.zoom.max) {
        newConstraints.zoom = Math.min(caps.zoom.max, 2.0);
      }

      if (Object.keys(newConstraints).length) {
        await track.applyConstraints({ advanced: [newConstraints] });
      }
    } catch {
      // ignore if not supported
    }
  }

  async function startScanner() {
    if (running) return;
    setStatus("Starting camera…");
    setFirestoreError("");

    try {
      // Request higher resolution to improve recognition speed/accuracy
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: deviceId ? undefined : { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
        // Tune autofocus/zoom if possible
        tuneTrack(videoRef.current);
      }

      await refreshDevices();

      // Native detector (faster) on cropped ROI
      const NativeDetector = globalThis.BarcodeDetector;
      if (NativeDetector) {
        try {
          detectorRef.current = new NativeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
          });
        } catch {
          detectorRef.current = null;
        }
      }

      if (detectorRef.current) {
        setRunning(true);
        setStatus("Center the barcode in the box");

        // Prepare ROI canvas
        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }

        const loop = async () => {
          if (!detectorRef.current || !videoRef.current) return;

          const video = videoRef.current;
          const vw = video.videoWidth || 1280;
          const vh = video.videoHeight || 720;

          // Compute ROI rect centered in the video, with same aspect as finder box
          const scale = Math.min(vw / 360, vh / 480); // rough scaling reference
          const roiW = Math.min(FINDER_WIDTH * (vw / video.clientWidth), vw * 0.9);
          const roiH = Math.min(FINDER_HEIGHT * (vh / video.clientHeight), vh * 0.5);
          const rx = Math.round((vw - roiW) / 2);
          const ry = Math.round((vh - roiH) / 2);

          const canvas = canvasRef.current;
          canvas.width = roiW;
          canvas.height = roiH;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(video, rx, ry, roiW, roiH, 0, 0, roiW, roiH);

          try {
            const results = await detectorRef.current.detect(canvas);
            if (results && results.length) {
              const raw = results[0]?.rawValue || "";
              if (raw) handleDetected(raw);
            }
          } catch {
            // ignore frame errors
          }

          // Run at ~30fps but detection each ~2 frames (smoother UI, less CPU)
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } else {
        // ZXing fallback: whole frame scanning (slower than ROI but reliable)
        await zxingRef.current.decodeFromVideoDevice(
          deviceId || undefined,
          videoRef.current,
          (result /*, err */) => {
            if (!result) return;
            handleDetected(result.getText());
          }
        );
        setRunning(true);
        setStatus("Center the barcode in the box");
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

  // Debounced handler
  function handleDetected(raw) {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return;

    const now = Date.now();
    if (lastScanRef.current.code === digits && now - lastScanRef.current.t < 900) return;
    lastScanRef.current = { code: digits, t: now };

    if (![8, 12, 13].includes(digits.length)) return;

    setLastCode(digits);
    saveBook(digits);
  }

  async function ensureActiveList() {
    if (!uid) return null;
    if (selectedListId) return selectedListId;

    // Try most recent
    const qRef = query(collection(db, "users", uid, "wishlists"), orderBy("updatedAt", "desc"), limit(1));
    const snap = await getDocs(qRef);
    if (!snap.empty) {
      const id = snap.docs[0].id;
      setSelectedListId(id);
      return id;
    }

    // Create if none
    const name = `Visit — ${new Date().toLocaleDateString()}`;
    const ref = await addDoc(collection(db, "users", uid, "wishlists"), {
      name,
      isPublic: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setSelectedListId(ref.id);
    return ref.id;
  }

  async function saveBook(isbnDigits) {
    setStatus("Looking up…");
    setFirestoreError("");

    const book = await lookupBook(isbnDigits);
    if (!book) { setStatus("Not found"); return; }
    if (!uid) { setStatus("Not signed in."); setFirestoreError("auth/no-user"); return; }

    try {
      const listId = await ensureActiveList();

      if (listId) {
        await setDoc(
          doc(db, "users", uid, "wishlists", listId, "items", book.isbn),
          { ...book, addedAt: serverTimestamp() },
          { merge: true }
        );
        await updateDoc(doc(db, "users", uid, "wishlists", listId), { updatedAt: serverTimestamp() });
      }

      // Legacy path so Home still shows items if needed
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

  // Manual ISBN entry (real add)
  const [manualIsbn, setManualIsbn] = useState("");
  function onManualSubmit(e) {
    e.preventDefault();
    const digits = manualIsbn.replace(/\D/g, "");
    if (!digits) return;
    handleDetected(digits);
    setManualIsbn("");
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopScanner(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: 16, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Scan a Book</h1>
        <a className="cc-btn-outline" href="/">Home</a>
      </div>

      {/* Active list */}
      <div className="cc-card" style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 14, opacity: 0.8 }}>Active list:</span>
          <select
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #ccc", minWidth: 160 }}
          >
            {!lists.length && <option value="">(creating…)</option>}
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.name || "Wishlist"}</option>
            ))}
          </select>
        </div>
        <div style={{ color: "#666", fontSize: 12 }}>Scans will be added here.</div>
      </div>

      <div className="cc-card" style={{ display: "grid", gap: 10 }}>
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
                <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera"}</option>
              ))}
            </select>
            <button className="cc-btn-outline" onClick={() => { stopScanner(); startScanner(); }}>
              Switch
            </button>
          </div>
        )}

        {/* Video with smaller size */}
        <div style={{ position: "relative", width: "100%", display: "grid", placeItems: "center" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "100%",
              maxWidth: 360,        // compact window
              aspectRatio: "3 / 4",
              borderRadius: 12,
              background: "#000",
              display: "block",
            }}
          />

          {/* --- Inverted overlay: center bright, outside dim --- */}
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
                width: FINDER_WIDTH,
                maxWidth: "90%",
                height: FINDER_HEIGHT,
              }}
            >
              {/* Outside dim using CSS mask (transparent window over dim layer) */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  // Dim the entire area
                  background: "rgba(0,0,0,0.45)",
                  // Cut out the center rectangle (finder) to keep it BRIGHT
                  WebkitMask: "linear-gradient(#000, #000)",
                  maskComposite: "exclude",
                  WebkitMaskComposite: "destination-out",
                }}
              />
              {/* Clear center "finder" (just a placeholder to define the mask box) */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: FINDER_WIDTH,
                  height: FINDER_HEIGHT,
                  transform: "translate(-50%, -50%)",
                  background: "transparent",
                  borderRadius: 12,
                  boxShadow: "0 0 0 2px rgba(255,255,255,0.95) inset",
                }}
              />
              {/* Corners */}
              {["tl","tr","bl","br"].map((pos) => (
                <span
                  key={pos}
                  style={{
                    position: "absolute",
                    width: 22,
                    height: 22,
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
                  left: "50%",
                  transform: "translateX(-50%)",
                  top: 4,
                  width: Math.min(FINDER_WIDTH - 12, 300),
                  height: 2,
                  background: "rgba(207,172,120,0.95)",
                  boxShadow: "0 0 12px rgba(207,172,120,0.9)",
                  borderRadius: 2,
                  animation: "ccScanLine 1100ms linear infinite",
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
          Tips: moderate distance (5–8"), avoid glare, align the barcode in the bright box.
        </div>
      </div>

      {/* Manual ISBN entry (adds to the same active list) */}
      <div className="cc-card" style={{ marginTop: 12 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const digits = manualIsbn.replace(/\D/g, "");
            if (digits) {
              handleDetected(digits);
              setManualIsbn("");
            }
          }}
          style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, maxWidth: 420, margin: "0 auto" }}
        >
          <input
            value={manualIsbn}
            onChange={(e) => setManualIsbn(e.target.value)}
            placeholder="Enter ISBN / UPC"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc" }}
          />
          <button className="cc-btn" type="submit">Add ISBN</button>
        </form>
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes ccScanLine {
          0%   { transform: translate(-50%, 0); opacity: 0.35; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translate(-50%, ${FINDER_HEIGHT - 8}px); opacity: 0.35; }
        }
      `}</style>
    </main>
  );
}
