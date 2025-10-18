// src/app/scan/page.jsx
"use client";
export const dynamic = "force-dynamic";

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
  const trackRef = useRef(null);            // MediaStreamTrack for focus/zoom
  const imageCaptureRef = useRef(null);     // for tap-to-focus where supported

  const [uid, setUid] = useState(null);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);

  const selectedListIdRef = useRef(null);
  const busyRef = useRef(false);

  const [last, setLast] = useState("");
  const [status, setStatus] = useState("");
  const [zoom, setZoom] = useState(null);
  const [zoomRange, setZoomRange] = useState(null);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => { selectedListIdRef.current = selectedListId; }, [selectedListId]);

  // Auth + subscribe to user's lists (run once)
  useEffect(() => {
    let stopLists = null;
    (async () => {
      const user = await ensureAuth(); // require login; switch to { allowAnonymous:true } only if enabled
      if (!user?.uid) {
        setStatus("Please log in to save scans.");
        return;
      }
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

  // Camera + scanner (run once)
  useEffect(() => {
    let stopped = false;
    let localControls = null;

    async function start() {
      try {
        // Request environment camera with autofocus/zoom hints where supported
        const constraints = {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            // Hints — browsers ignore unsupported ones
            focusMode: "continuous",
            advanced: [{ focusMode: "continuous" }],
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;

        const [track] = stream.getVideoTracks();
        trackRef.current = track;

        // Try to expose zoom/focus and torch controls if device supports
        try {
          const capabilities = trackRef.current.getCapabilities?.() || {};
          if (capabilities.zoom) {
            const { min, max, step } = capabilities.zoom;
            setZoomRange({ min, max, step: step || 0.1 });
            setZoom(track.getSettings?.().zoom ?? min ?? 1);
          }
          if ("torch" in capabilities) {
            // leave torch off by default
          }

          // ImageCapture for tap-to-focus on mobile Chromium
          const imageCapture = new (window.ImageCapture || function(){})();
          try {
            // @ts-ignore - some browsers
            imageCaptureRef.current = new ImageCapture(trackRef.current);
          } catch {}
        } catch (e) {
          console.warn("Capabilities not available:", e);
        }

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

            // show last code
            setLast((prev) => (prev === digits ? prev : digits));

            // debounce while we add
            if (busyRef.current) return;
            busyRef.current = true;

            setStatus("Looking up…");
            let book = await lookupBook(digits);
            if (!book) {
              book = { isbn: digits, title: `Scanned ISBN ${digits}`, author: "", image: "" };
            }

            // ensure user (already done once; re-check to be safe)
            const user = await ensureAuth();
            if (!user?.uid) {
              setStatus("Please log in to save scans.");
              busyRef.current = false;
              return;
            }

            // ensure a list
            let targetListId = selectedListIdRef.current;
            if (!targetListId) {
              setStatus("Creating a list…");
              try {
                targetListId = await createList(user.uid, `Visit — ${new Date().toLocaleDateString()}`);
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
              console.log("Added", book, "to", targetListId);
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
    }

    start();

    return () => {
      stopped = true;
      try { localControls && localControls.stop(); } catch {}
      try { reader && reader.reset(); } catch {}
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
      imageCaptureRef.current = null;
    };
  }, [reader]);

  // Apply zoom change
  async function applyZoom(v) {
    try {
      if (!trackRef.current) return;
      await trackRef.current.applyConstraints({ advanced: [{ zoom: v }] });
      setZoom(v);
    } catch (e) {
      console.warn("Zoom not supported:", e);
    }
  }

  // Toggle torch if supported
  async function toggleTorch() {
    try {
      if (!trackRef.current) return;
      const caps = trackRef.current.getCapabilities?.() || {};
      if (!("torch" in caps)) return;
      await trackRef.current.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch (e) {
      console.warn("Torch not supported:", e);
    }
  }

  // Tap-to-focus (best effort; only on some mobile browsers/cameras)
  async function tapToFocus(ev) {
    try {
      const track = trackRef.current;
      if (!track) return;
      const caps = track.getCapabilities?.() || {};
      // If the browser exposes focusMode, set to "continuous" again (or "single-shot" if supported)
      if (caps.focusMode) {
        const modes = caps.focusMode;
        const wanted = modes.includes("continuous") ? "continuous" : (modes[0] || null);
        if (wanted) await track.applyConstraints({ advanced: [{ focusMode: wanted }] });
        setStatus("Refocusing…");
      }
    } catch (e) {
      console.warn("Tap-to-focus not supported:", e);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <button className="cc-btn-outline" onClick={() => history.back()}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Scan a Book</h1>
        <a className="cc-btn-outline" href="/">Home</a>
      </div>

      <div className="cc-card" style={{ padding: 8 }}>
        <video
          ref={videoRef}
          onClick={tapToFocus}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", maxWidth: 540, borderRadius: 12, background: "#000" }}
        />
        <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center", flexWrap:"wrap" }}>
          {zoomRange && (
            <>
              <label style={{ fontSize:12, opacity:.7 }}>Zoom</label>
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom ?? zoomRange.min}
                onChange={(e) => applyZoom(Number(e.target.value))}
              />
            </>
          )}
          <button className="cc-btn-outline" onClick={toggleTorch}>💡 {torchOn ? "Torch off" : "Torch on"}</button>
        </div>
      </div>

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
