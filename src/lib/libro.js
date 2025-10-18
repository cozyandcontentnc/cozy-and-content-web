// src/lib/libro.js

// Store slug confirmed here:
// https://libro.fm/cozyandcontentnc  and /about page exists. :contentReference[oaicite:0]{index=0}

const STORE = "cozyandcontentnc";

/**
 * Search by title/author, scoped to your store.
 * (Fixes old `?query=` → Libro uses `?q=`.)
 */
export function libroSearchUrl(title, author) {
  const q = encodeURIComponent([title || "", author || ""].join(" ").trim());
  return `https://libro.fm/search?q=${q}&bookstore=${STORE}`;
}

/**
 * ISBN search (safest way to land on the right audiobook page).
 */
export function libroSearchByIsbn(isbn) {
  const q = encodeURIComponent((isbn || "").toString());
  return `https://libro.fm/search?q=${q}&bookstore=${STORE}`;
}

/**
 * Gift credits page (official gift flow).
 */
export function libroGiftCreditsUrl() {
  // Libro gift page; works regardless of store, user picks the store during purchase.
  // See docs: gifting & gift page. :contentReference[oaicite:1]{index=1}
  return `https://libro.fm/gift`;
}
