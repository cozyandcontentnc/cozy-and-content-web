// src/components/BottomBar.jsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Tab({ href, label, icon, active }) {
  return (
    <Link
      href={href}
      style={{
        flex: 1,
        textAlign: "center",
        textDecoration: "none",
        color: active ? "var(--cc-accent)" : "var(--cc-text)",
        padding: 8,
        fontSize: 12,
        fontWeight: active ? 700 : 600,
      }}
    >
      <div style={{ fontSize: 20, lineHeight: "20px" }}>{icon}</div>
      <div>{label}</div>
    </Link>
  );
}

export default function BottomBar() {
  const pathname = usePathname();
  const active = (p) => (pathname === p || pathname.startsWith(p + "/"));

  return (
    <nav
      className="cc-card"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        display: "flex",
        gap: 8,
      }}
    >
      <Tab href="/" label="Home" icon="🏠" active={active("/")} />
      <Tab href="/scan" label="Scan" icon="📷" active={active("/scan")} />
      <Tab href="/requests" label="Requests" icon="📨" active={active("/requests")} />
      <Tab href="/settings" label="Settings" icon="⚙️" active={active("/settings")} />
    </nav>
  );
}
