// src/app/account/login/page.jsx
"use client";
export const dynamic = "force-dynamic";

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
      // Only bounce away if the user is a real (non-anonymous) account
      if (u?.uid && !u.isAnonymous) router.replace("/");
    });
    return () => unsub();
  }, [router]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      // Settle auth state; ensureAuth no-ops if already real
      await ensureAuth();
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

      <div style={{ marginTop: 12 }}>
        New here?{" "}
        <a
          href="/account/signup"
          className="cc-link"
          onClick={(e) => { e.preventDefault(); router.push("/account/signup"); }}
        >
          Create an account
        </a>
      </div>

      <p style={{ marginTop: 8, fontSize: 12, color: "var(--cc-sub)" }}>
        You can keep browsing as a guest — logging in just lets you save wishlists across devices.
      </p>
    </main>
  );
}
