// src/lib/libro.js
export function libroSearchUrl(title, author) {
  const q = encodeURIComponent([title || "", author || ""].join(" ").trim());
  return `https://libro.fm/cozyandcontentnc/search?query=${q}`;
}
