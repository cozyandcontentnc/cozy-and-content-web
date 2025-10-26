// src/app/account/forgot/page.jsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg("Reset email sent. Please check your inbox.");
    } catch (e) {
      setMsg(e.message || "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>Forgot password</h1>
      <form onSubmit={onSubmit} className="cc-card" style={{ display: "grid", gap: 8 }}>
        <input
          className="cc-card"
          type="email"
          placeholder="Your account email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="cc-btn" disabled={busy}>{busy ? "Sending…" : "Send reset email"}</button>
        {msg && <div style={{ fontSize: 13 }}>{msg}</div>}
      </form>

      <p style={{ marginTop: 12 }}>
        <Link href="/account/login" className="cc-link">← Back to login</Link>
      </p>
    </main>
  );
}
