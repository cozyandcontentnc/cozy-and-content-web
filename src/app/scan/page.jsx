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

// ---- Google Books lookup ----
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
  const detectorRef = useRef(null);
  const zxingRef = useRef(null);
  const canvasRef = useRef(null);
  const backDeviceIdRef = useRef(null);

  const [uid, setUid] = useState(null);

  // Lists
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");

  // UI
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Tap Start to enable the camera");
  const [lastCode, setLastCode] = useState("");
  const [firestoreError, setFirestoreError] = useState("");

  // ====== Finder size (30% larger) ======
  const FINDER_SCALE = 1.3;
  const BASE_FINDER_WIDTH = 320;
  const BASE_FINDER_HEIGHT = 140;
  const FINDER_WIDTH = Math.round(BASE_FINDER_WIDTH * FINDER_SCALE);
  const FINDER_HEIGHT = Math.round(BASE_FINDER_HEIGHT * FINDER_SCALE);
  const BASE_BOX_MAX_W = 420; // previous cap for video container
  const BOX_MAX_W = Math.round(BASE_BOX_MAX_W * FINDER_SCALE); // scale container cap too

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
    return () => {
      active = false;
    };
  }, []);

  // Load lists & auto-create if none
  useEffect(() => {
    if (!uid) return;
    const listsCol = collection(db, "users", uid, "wishlists");
    const qRef = query(listsCol, orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(qRef, async (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
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

      if (!selectedListId) setSelectedListId(arr[0].id);
      else if (!arr.find((l) => l.id === selectedListId)) setSelectedListId(arr[0].id);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Pick ONE back camera only
  async function pickBackCameraId() {
    try {
      if (backDeviceIdRef.current) return backDeviceIdRef.current;

      // First enumerate; labels may be empty until permission granted
      const inputs = await BrowserMultiFormatReader.listVideoInputDevices();
      let chosen =
        inputs.find((d) => {
          const L = (d.label || "").toLowerCase();
          return L.includes("back") || L.includes("rear") || L.includes("environment");
        }) || inputs[0];

      if (!chosen || !chosen.deviceId) {
        // Prompt for environment, then re-enumerate to get labels
        const tmp = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        tmp.getTracks().forEach((t) => t.stop());

        const inputs2 = await BrowserMultiFormatReader.listVideoInputDevices();
        chosen =
          inputs2.find((d) => {
            const L = (d.label || "").toLowerCase();
            return L.includes("back") || L.includes("rear") || L.includes("environment");
          }) || inputs2[0];
      }

      backDeviceIdRef.current = chosen?.deviceId || null;
      return backDeviceIdRef.current;
    } catch {
      return null;
    }
  }

  function stopStreams() {
    try {
      zxingRef.current?.reset();
    } catch {}
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  // Try continuous autofocus + mild zoom (if supported)
  async function tuneTrack(video) {
    try {
      const stream = video.srcObject;
      const track = stream?.getVideoTracks?.()[0];
      if (!track) return;
      const caps = track.getCapabilities?.() || {};
      const newConstraints = {};
      if (caps.focusMode && caps.focusMode.includes("continuous")) newConstraints.focusMode = "continuous";
      if (caps.zoom && typeof caps.zoom.max === "number") newConstraints.zoom = Math.min(caps.zoom.max, 2.0);
      if (Object.keys(newConstraints).length) await track.applyConstraints({ advanced: [newConstraints] });
    } catch {}
  }

  async function startScanner() {
    if (running) return;
    setStatus("Starting camera…");
    setFirestoreError("");

    try {
      const pickedId = await pickBackCameraId();

      // Request back/environment camera; CSS ensures it fills the box.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(pickedId ? { deviceId: { exact: pickedId } } : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: FINDER_WIDTH / FINDER_HEIGHT, // hint only; CSS does the real fit
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {}
        await tuneTrack(videoRef.current);
      }

      // Native detector (if available)
      detectorRef.current = null;
      const NativeDetector = typeof window !== "undefined" ? window.BarcodeDetector : null;
      if (NativeDetector) {
        try {
          detectorRef.current = new NativeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
          });
        } catch {
          detectorRef.current = null;
        }
      }

      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");

      if (detectorRef.current) {
        setRunning(true);
        setStatus("Center the barcode in the box");

        const loop = async () => {
          if (!detectorRef.current || !videoRef.current) return;
          const video = videoRef.current;
          const vw = video.videoWidth || 1280;
          const vh = video.videoHeight || 720;

          // Visible size for scaling ROI from CSS pixels to video pixels
          const cssW = video.clientWidth || FINDER_WIDTH;
          const cssH = video.clientHeight || FINDER_HEIGHT;

          const scaleX = vw / cssW;
          const scaleY = vh / cssH;

          const roiW = Math.min(FINDER_WIDTH * scaleX, vw);
          const roiH = Math.min(FINDER_HEIGHT * scaleY, vh);
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
          } catch {}

          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } else {
        // ZXing fallback (still uses the single picked device)
        await zxingRef.current.decodeFromVideoDevice(pickedId || undefined, videoRef.current, (result) => {
          if (!result) return;
          handleDetected(result.getText());
        });
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

    const qRef = query(collection(db, "users", uid, "wishlists"), orderBy("updatedAt", "desc"), limit(1));
    const snap = await getDocs(qRef);
    if (!snap.empty) {
      const id = snap.docs[0].id;
      setSelectedListId(id);
      return id;
    }

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
    if (!book) {
      setStatus("Not found");
      return;
    }
    if (!uid) {
      setStatus("Not signed in.");
      setFirestoreError("auth/no-user");
      return;
    }

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

      // Legacy path for Home screen
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

  // Create a new list from Scan page
  async function onCreateList() {
    if (!uid) return;
    const name = prompt("Name your new wishlist:", `Visit — ${new Date().toLocaleDateString()}`);
    if (!name || !name.trim()) return;
    try {
      const ref = await addDoc(collection(db, "users", uid, "wishlists"), {
        name: name.trim(),
        isPublic: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSelectedListId(ref.id);
      setStatus(`Created list: ${name.trim()}`);
    } catch (e) {
      console.error(e);
      setStatus("Couldn’t create the wishlist.");
    }
  }

  // Cleanup
  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: 16, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui" }}>
      {/* Prevent input zoom (also see global style at bottom) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>
          ← Back
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Scan a Book</h1>
        <a className="cc-btn-outline" href="/">
          Home
        </a>
      </div>

      {/* Active list + New List button */}
      <div
        className="cc-card"
        style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 14, opacity: 0.8 }}>Active list:</span>
          <select
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #ccc", minWidth: 170, fontSize: 16 }}
          >
            {!lists.length && <option value="">(creating…)</option>}
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name || "Wishlist"}
              </option>
            ))}
          </select>
        </div>
        <button className="cc-btn-outline" onClick={onCreateList}>
          ➕ New List
        </button>
      </div>

      <div className="cc-card" style={{ display: "grid", gap: 10 }}>
        {/* Fixed-aspect container that matches the (bigger) finder box; video fills it */}
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: BOX_MAX_W,
            margin: "0 auto",
            aspectRatio: `${FINDER_WIDTH} / ${FINDER_HEIGHT}`,
            borderRadius: 12,
            overflow: "hidden",
            background: "#000",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover", // fill the box; center-crop if needed
              display: "block",
            }}
          />

          {/* Overlay with (bigger) finder */}
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
                maxWidth: "95%",
                height: FINDER_HEIGHT,
              }}
            >
              {/* Dim outside of finder */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.45)",
                  WebkitMask: "linear-gradient(#000, #000)",
                  maskComposite: "exclude",
                  WebkitMaskComposite: "destination-out",
                }}
              />
              {/* Finder box */}
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
              {/* Corner accents */}
              {["tl", "tr", "bl", "br"].map((pos) => (
                <span
                  key={pos}
                  style={{
                    position: "absolute",
                    width: 22,
                    height: 22,
                    borderColor: "rgba(255,255,255,0.95)",
                    ...(pos === "tl" && {
                      top: -2,
                      left: -2,
                      borderTopWidth: 4,
                      borderLeftWidth: 4,
                      borderStyle: "solid",
                    }),
                    ...(pos === "tr" && {
                      top: -2,
                      right: -2,
                      borderTopWidth: 4,
                      borderRightWidth: 4,
                      borderStyle: "solid",
                    }),
                    ...(pos === "bl" && {
                      bottom: -2,
                      left: -2,
                      borderBottomWidth: 4,
                      borderLeftWidth: 4,
                      borderStyle: "solid",
                    }),
                    ...(pos === "br" && {
                      bottom: -2,
                      right: -2,
                      borderBottomWidth: 4,
                      borderRightWidth: 4,
                      borderStyle: "solid",
                    }),
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
                  width: Math.min(FINDER_WIDTH - 12, 300 * FINDER_SCALE),
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
            <button className="cc-btn" onClick={startScanner}>
              ▶️ Start
            </button>
          ) : (
            <button className="cc-btn-outline" onClick={stopScanner}>
              ⏹ Stop
            </button>
          )}
          <a className="cc-btn-outline" href="/scan">
            ↻ Reset
          </a>
        </div>
      </div>

      <div className="cc-card" style={{ marginTop: 12, display: "grid", gap: 6 }}>
        <div>
          Last code: <strong>{lastCode || "—"}</strong>
        </div>
        <div style={{ color: "#555" }}>{status}</div>
        {firestoreError && (
          <div style={{ color: "#a33", fontSize: 12 }}>
            Firestore error: <code>{firestoreError}</code>
          </div>
        )}
      </div>

      {/* Manual ISBN entry (adds to active list) */}
      <div className="cc-card" style={{ marginTop: 12 }}>
        <form
          onSubmit={onManualSubmit}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            maxWidth: 420,
            margin: "0 auto",
          }}
        >
          <input
            value={manualIsbn}
            onChange={(e) => setManualIsbn(e.target.value)}
            placeholder="Enter ISBN / UPC"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 16, // prevent mobile zoom
            }}
          />
          <button className="cc-btn" type="submit">
            Add ISBN
          </button>
        </form>
      </div>

      {/* Animations + mobile zoom prevention */}
      <style jsx>{`
        @keyframes ccScanLine {
          0% {
            transform: translate(-50%, 0);
            opacity: 0.35;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(-50%, ${FINDER_HEIGHT - 8}px);
            opacity: 0.35;
          }
        }
        /* Prevent mobile zoom on form controls */
        :global(input),
        :global(select),
        :global(textarea) {
          font-size: 16px;
        }
      `}</style>
    </main>
  );
}
