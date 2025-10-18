// src/components/AppShell.jsx
"use client";

import { usePathname } from "next/navigation";
import BottomBar from "@/components/BottomBar";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const hideBottomBar = pathname.startsWith("/account/"); // hide on login/signup

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: hideBottomBar ? 0 : 64 }}>
      {children}
      {!hideBottomBar && <BottomBar />}
    </div>
  );
}
