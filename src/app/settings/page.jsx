// src/app/settings/page.jsx
"use client";
export default function SettingsRedirect() {
  if (typeof window !== "undefined") {
    window.location.replace("/profile");
  }
  return null;
}
