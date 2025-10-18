"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function Page() {
  const videoRef = useRef(null);
  const [last, setLast] = useState("");

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stopped = false;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const id = devices?.[0]?.deviceId;
        if (!id || !videoRef.current) return;
        await reader.decodeFromVideoDevice(id, videoRef.current, (result) => {
          if (!stopped && result) setLast(result.getText());
        });
      } catch {}
    })();

    return () => { stopped = true; reader.reset(); };
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Scan a Book</h1>
      <video ref={videoRef} style={{ width: "100%", maxWidth: 480, borderRadius: 8 }} muted playsInline />
      <p style={{ marginTop: 12 }}>Last code: <strong>{last || "—"}</strong></p>
    </main>
  );
}
