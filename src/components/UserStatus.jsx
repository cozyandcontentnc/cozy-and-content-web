// src/components/UserStatus.jsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function UserStatus({ compact = false }) {
  const [user, setUser] = useState(null);
  const router = useRouter();
  const isAuthed = !!user && !user.isAnonymous;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
  }

  function hardNav(href) {
    // Use hard navigation to avoid any client-side interception/overlays
    window.location.href = href;
  }

  const containerStyle = compact
    ? { margin: "8px auto 16px", maxWidth: 900 }
    : { margin: "0 auto 20px", maxWidth: 900 };

  if (isAuthed) {
    const name = user.displayName || user.email || "Account";
    return (
      <section
        className="cc-card"
        style={{ ...containerStyle, display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}
      >
        <div style={{ fontWeight: 700 }}>
          Signed in as <span style={{ color: "var(--cc-accent)" }}>{name}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="cc-btn-outline" onClick={() => hardNav("/account/profile")}>Profile</button>
          <button className="cc-btn-outline" onClick={handleSignOut}>Sign out</button>
        </div>
      </section>
    );
  }

  // Not signed in (includes anonymous)
  return (
    <section className="cc-card" style={{ ...containerStyle }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>You’re not signed in</div>
        <div style={{ color: "var(--cc-sub)" }}>
          You can browse and scan as a guest, but creating an account helps you keep your wishlists across devices.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="cc-btn" onClick={() => hardNav("/account/signup")}>Create an account</button>
          <button className="cc-btn-outline" onClick={() => hardNav("/account/login")}>Log in</button>
        </div>
      </div>
    </section>
  );
}
