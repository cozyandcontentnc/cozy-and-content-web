// src/lib/libro.js

// Cozy & Content Libro.fm store slug
const STORE = "cozyandcontentnc";

/**
 * Store-scoped search by title/author.
 * Example: https://libro.fm/search?q=the%20hobbit&bookstore=cozyandcontentnc
 */
export function libroSearchUrl(title, author) {
  const q = encodeURIComponent([title || "", author || ""].join(" ").trim());
  return `https://libro.fm/search?q=${q}&bookstore=${STORE}`;
}

/**
 * Store-scoped search by ISBN (best chance to land on the exact book page).
 */
export function libroSearchByIsbn(isbn) {
  const q = encodeURIComponent((isbn || "").toString());
  return `https://libro.fm/search?q=${q}&bookstore=${STORE}`;
}
