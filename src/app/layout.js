export const metadata = {
  title: "Cozy & Content",
  description: "Wishlist & scanner",
};

import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
