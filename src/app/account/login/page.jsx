// src/app/account/login/page.jsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, ensureAuth } from "@/lib/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u?.uid) router.replace("/");
    });
    return () => unsub();
  }, [router]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      await ensureAuth(); // normalize local state if you use it elsewhere
      router.replace("/");
    } catch (e) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>Log in</h1>
      <form onSubmit={onSubmit} className="cc-card" style={{ display: "grid", gap: 8 }}>
        <input
          className="cc-card"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="cc-card"
          type="password"
          placeholder="Password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        {err && <div style={{ color: "#9C2E2E", fontSize: 13 }}>{err}</div>}
        <button className="cc-btn" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      </form>

      <p style={{ marginTop: 12 }}>
        New here? <Link href="/account/signup" className="cc-link">Create an account</Link>
      </p>
    </main>
  );
}
