// src/app/account/signup/page.jsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      // ✅ Only redirect if the user is a real (non-anonymous) account
      if (u?.uid && !u.isAnonymous) router.replace("/");
    });
    return () => unsub();
  }, [router]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }
      router.replace("/");
    } catch (e) {
      setErr(e.message || "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>Create account</h1>
      <form onSubmit={onSubmit} className="cc-card" style={{ display: "grid", gap: 8 }}>
        <input
          className="cc-card"
          type="text"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
          placeholder="Password (min 6 chars)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        {err && <div style={{ color: "#9C2E2E", fontSize: 13 }}>{err}</div>}
        <button className="cc-btn" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>

      <p style={{ marginTop: 12 }}>
        Already have an account? <Link href="/account/login" className="cc-link">Log in</Link>
      </p>

      <p style={{ marginTop: 8, fontSize: 12, color: "var(--cc-sub)" }}>
        Prefer to browse as a guest? No problem — you can always create an account later.
      </p>
    </main>
  );
}
