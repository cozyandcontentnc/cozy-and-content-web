// src/app/layout.js
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Cozy & Content Wishlists",
  description: "Scan barcodes and build/share wishlists at Cozy & Content",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* ✅ New app icons and manifest */}
        <link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FAF7F2" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
