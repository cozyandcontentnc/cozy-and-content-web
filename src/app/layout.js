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
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
