"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function Page() {
  const videoRef = useRef(null);
  const [last, setLast] = useState("");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState([]);
  const [idx, setIdx] = useState(0);
  const [reader] = useState(() => new BrowserMultiFormatReader());

  useEffect(() => {
    let stopped = false;

    async function start() {
      setError("");
      try {
        // 1) Ensure permission is requested with environment camera if possible
        //    This improves Safari/iOS reliability.
        await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        // 2) List cameras
        const cams = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevices(cams);
        const pick = cams[idx] ? cams[idx].deviceId : cams[0]?.deviceId;

        // 3) Start decoding with explicit constraints (more robust than deviceId on Safari)
        if (!videoRef.current) return;

        await reader.decodeFromConstraints(
          {
            video: pick
              ? { deviceId: { exact: pick } }
              : { facingMode: { ideal: "environment" } },
            audio: false,
          },
          videoRef.current,
          (result, err) => {
            if (stopped || !result) return;
            const text = result.getText();
            setLast(text);
            // You can debounce or save to Firestore here if desired
          }
        );
      } catch (e) {
        console.error(e);
        setError(
          e?.name === "NotAllowedError"
            ? "Camera permission was denied. Please allow camera access in your browser settings."
            : e?.message || "Unable to access camera."
        );
      }
    }

    start();
    return () => {
      stopped = true;
      try { reader.reset(); } catch {}
      // stop video tracks
      const stream = videoRef.current?.srcObject;
      if (stream && typeof stream.getTracks === "function") {
        stream.getTracks().forEach(t => t.stop());
      }
    };
    // re-run when idx changes (switch camera)
  }, [idx, reader]);

  const switchCamera = () => {
    if (!devices.length) return;
    setIdx((i) => (i + 1) % devices.length);
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Scan a Book</h1>

      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={switchCamera} disabled={!devices.length}>
          🔄 Switch camera ({devices.length || 0})
        </button>
        <span style={{ opacity: 0.7, fontSize: 12 }}>
          {devices[idx]?.label || "Camera"} {devices.length ? `(${idx + 1}/${devices.length})` : ""}
        </span>
      </div>

      <video
        ref={videoRef}
        // autoplay MUST be set; muted+playsInline help Safari/iOS
        autoPlay
        muted
        playsInline
        style={{ width: "100%", maxWidth: 480, borderRadius: 8, background: "#000" }}
      />

      <p style={{ marginTop: 12 }}>
        Last code: <strong>{last || "—"}</strong>
      </p>

      {error && (
        <p style={{ marginTop: 8, color: "#b00020" }}>
          {error}
        </p>
      )}

      <details style={{ marginTop: 12 }}>
        <summary>Debug info</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>
{JSON.stringify(
  {
    hasMediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    devices: devices.map(d => ({ kind: d.kind, label: d.label, deviceId: d.deviceId })),
  },
  null,
  2
)}
        </pre>
      </details>
    </main>
  );
}
