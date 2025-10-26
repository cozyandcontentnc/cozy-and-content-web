// src/app/profile/page.jsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, db, ensureAuth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  updatePassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import UserStatus from "@/components/UserStatus";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Change Password fields
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (!u) return;

      setDisplayName(u.displayName || "");

      // Check admins/{uid} — if it exists, show admin link
      try {
        const snap = await getDoc(doc(db, "admins", u.uid));
        setIsAdmin(!!snap.exists());
      } catch {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  async function onSave() {
    if (!auth.currentUser || auth.currentUser.isAnonymous) return;
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

  async function onSendReset() {
    if (!user?.email) {
      setMsg("No email on file for this account.");
      setTimeout(() => setMsg(""), 1500);
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await sendPasswordResetEmail(auth, user.email);
      setMsg("Password reset email sent.");
    } catch (e) {
      setMsg(e.message || "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword() {
    if (!auth.currentUser || auth.currentUser.isAnonymous) return;
    if (!newPw || newPw.length < 6) {
      setMsg("New password must be at least 6 characters.");
      setTimeout(() => setMsg(""), 1500);
      return;
    }
    if (newPw !== newPw2) {
      setMsg("Passwords do not match.");
      setTimeout(() => setMsg(""), 1500);
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await updatePassword(auth.currentUser, newPw);
      setMsg("Password updated.");
      setNewPw("");
      setNewPw2("");
    } catch (e) {
      if (e?.code === "auth/requires-recent-login") {
        setMsg("Please log out and log back in to change your password.");
      } else {
        setMsg(e.message || "Could not update password.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    try {
      await signOut(auth);
    } finally {
      router.replace("/");
    }
  }

  const isRealUser = !!user && !user.isAnonymous;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Profile</h1>
        {isRealUser && isAdmin && (
          <span
            title="You have admin access"
            style={{
              background: "#365c4a", color: "#fff", fontSize: 12, padding: "2px 8px",
              borderRadius: 999, fontWeight: 700
            }}
          >
            Admin
          </span>
        )}
      </div>

      {/* Always show status banner (compact) */}
      <UserStatus compact />

      {/* Only show account tools if signed in (non-anonymous) */}
      {isRealUser && (
        <div className="cc-card" style={{ display: "grid", gap: 16 }}>
          {/* Email */}
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Email</div>
            <div style={{ fontWeight: 600 }}>{user.email || "—"}</div>
          </div>

          {/* Display name */}
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Display name</div>
            <input
              className="cc-card"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should we address you?"
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="cc-btn" onClick={onSave} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className="cc-btn-outline" onClick={onSignOut}>Sign out</button>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid #eee" }} />

          {/* Forgot password */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Forgot password</div>
            <div style={{ fontSize: 13, color: "#666" }}>
              We’ll email a password reset link to your address on file.
            </div>
            <button className="cc-btn-outline" onClick={onSendReset} disabled={busy || !user?.email}>
              {busy ? "Sending…" : "Send reset email"}
            </button>
          </div>

          {/* Change password */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Change password</div>
            <input
              className="cc-card"
              type="password"
              placeholder="New password (min 6)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <input
              className="cc-card"
              type="password"
              placeholder="Confirm new password"
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
            />
            <button className="cc-btn" onClick={onChangePassword} disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </button>
            <div style={{ fontSize: 12, color: "#666" }}>
              If you see “requires recent login,” please sign out and sign back in first.
            </div>
          </div>

          {/* Admin-only tools */}
          {isAdmin && (
            <div
              style={{
                marginTop: 4, paddingTop: 8, borderTop: "1px dashed #e9e3d9",
                display: "flex", gap: 8, flexWrap: "wrap"
              }}
            >
              <Link href="/admin" className="cc-btn-outline">🔧 Admin Console</Link>
            </div>
          )}

          {msg && <div style={{ fontSize: 13 }}>{msg}</div>}
        </div>
      )}
    </main>
  );
}
