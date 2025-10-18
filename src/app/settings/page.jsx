// src/app/settings/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, ensureAuth } from "@/lib/firebase";
import { onAuthStateChanged, updateProfile, signOut } from "firebase/auth";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/account/login");
        return;
      }
      setUser(u);
      setDisplayName(u.displayName || "");
    });
    return () => unsub();
  }, [router]);

  async function onSave() {
    if (!auth.currentUser) return;
    setBusy(true);
    setMsg("");
    try {
      await updateProfile(auth.currentUser, { displayName: displayName || null });
      await ensureAuth();
      setMsg("Saved!");
    } catch (e) {
      setMsg(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    await signOut(auth);
    router.replace("/account/login");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>Settings</h1>

      {user && (
        <div className="cc-card" style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Email</div>
            <div style={{ fontWeight: 600 }}>{user.email}</div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Display name</div>
            <input
              className="cc-card"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should we address you?"
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="cc-btn" onClick={onSave} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className="cc-btn-outline" onClick={onSignOut}>Sign out</button>
          </div>

          {msg && <div style={{ fontSize: 13 }}>{msg}</div>}
        </div>
      )}
    </main>
  );
}
