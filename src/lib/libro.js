// src/lib/libro.js
// Search through your Libro.fm affiliate storefront (safe, non-404).
export function libroSearchUrl(title, author) {
  const q = encodeURIComponent([title || "", author || ""].join(" ").trim());
  return `https://libro.fm/cozyandcontentnc/search?query=${q}`;
}

// Free-form search
export function libroSearch(query) {
  const q = encodeURIComponent(String(query || "").trim());
  return `https://libro.fm/cozyandcontentnc/search?query=${q}`;
}

// ISBN-13 search (best "Gift this book" CTA when you only have an ISBN)
export function libroSearchByIsbn(isbn13) {
  const q = String(isbn13 || "").replace(/[^0-9Xx]/g, "").trim();
  if (!q) return libroGiftCreditsUrl();
  return `https://libro.fm/cozyandcontentnc/search?query=${encodeURIComponent(q)}`;
}

// Gift credits landing (works consistently; do NOT append ISBN)
export function libroGiftCreditsUrl() {
  return "https://libro.fm/gift";
}
