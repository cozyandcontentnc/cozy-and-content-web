"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { ensureAuth, db, auth } from "@/lib/firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

async function lookupBook(isbn) {
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
}

export default function Page() {
  const videoRef = useRef(null);
  const [last, setLast] = useState("");
  const [status, setStatus] = useState("");
  const [reader] = useState(() => new BrowserMultiFormatReader());

  useEffect(() => {
    let stopped = false;
    ensureAuth();

    (async () => {
      try {
        // ✅ Always request environment camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const backCam =
          devices.find((d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear")
          ) || devices[0];

        await reader.decodeFromVideoDevice(backCam?.deviceId, videoRef.current, async (result) => {
          if (stopped || !result) return;
          const digits = result.getText().replace(/\D/g, "");
          setLast(digits);
          if (digits.length < 10) return;
          setStatus("Looking up…");

          const book = await lookupBook(digits);
          if (!book) return setStatus("Not found");

          const user = await ensureAuth();
          if (!user?.uid) return;

          await setDoc(
            doc(db, "wishlists", user.uid, "items", book.isbn),
            { ...book, addedAt: serverTimestamp() },
            { merge: true }
          );
          setStatus(`Added: ${book.title}`);
        });
      } catch (err) {
        console.error(err);
        setStatus("Camera access denied or unavailable.");
      }
    })();

    return () => {
      stopped = true;
      try { reader.reset(); } catch {}
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [reader]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Scan a Book</h1>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: "100%", maxWidth: 480, borderRadius: 8, background: "#000" }}
      />
      <p style={{ marginTop: 12 }}>Last code: <strong>{last || "—"}</strong></p>
      <p style={{ marginTop: 6, color: "#555" }}>{status}</p>
    </main>
  );
}
