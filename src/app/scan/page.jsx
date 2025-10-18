"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { ensureAuth, db, auth } from "@/lib/firebase"; // use "../../lib/firebase" if you aren't using the @ alias
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
  const [status, setStatus] = useState(""); // shows "Added: ..."
  const [busyUntil, setBusyUntil] = useState(0);
  const [reader] = useState(() => new BrowserMultiFormatReader());

  useEffect(() => { ensureAuth(); }, []);

  useEffect(() => {
    let stopped = false;

    (async () => {
      try {
        // request permission early for better device listing
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const pick = devices?.[0]?.deviceId;

        await reader.decodeFromConstraints(
          { video: pick ? { deviceId: { exact: pick } } : { facingMode: { ideal: "environment" } } },
          videoRef.current,
          async (result) => {
            if (stopped || !result) return;

            const now = Date.now();
            if (now < busyUntil) return; // debounce multiple hits

            const raw = result.getText() || "";
            const digits = raw.replace(/\D/g, "");
            setLast(digits);

            if (digits.length < 10) return;

            setBusyUntil(now + 2000); // 2s debounce while we fetch/write
            setStatus("Looking up…");

            const book = await lookupBook(digits);
            if (!book) { setStatus("Not found"); return; }

            const user = await ensureAuth();
            const uid = user?.uid;
            if (!uid) { setStatus("Auth error"); return; }

            await setDoc(
              doc(db, "wishlists", uid, "items", book.isbn),
              { ...book, addedAt: serverTimestamp() },
              { merge: true }
            );

            setStatus(`Added: ${book.title}`);
          }
        );
      } catch (e) {
        console.error(e);
        setStatus(e?.message || "Camera error");
      }
    })();

    return () => { stopped = true; try { reader.reset(); } catch {} };
  }, [busyUntil, reader]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Scan a Book</h1>
      <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", maxWidth: 480, borderRadius: 8, background: "#000" }} />
      <p style={{ marginTop: 12 }}>Last code: <strong>{last || "—"}</strong></p>
      <p style={{ marginTop: 6, color: "#555" }}>{status}</p>
    </main>
  );
}
