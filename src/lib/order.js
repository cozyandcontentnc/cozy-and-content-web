// src/lib/order.js

const KEY = "cc_order_v1";

export function getOrder() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

export function saveOrder(items) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
}

export function addToOrder(item) {
  // item: {title, author, isbn, image, fromShareId, ownerUid, listId, itemId}
  const now = Date.now();
  const current = getOrder();
  const exists = current.find(i =>
    i.itemId === item.itemId && i.fromShareId === item.fromShareId
  );
  if (!exists) current.unshift({ ...item, addedAt: now, purchased: false });
  saveOrder(current);
  return current;
}

export function removeFromOrder(index) {
  const current = getOrder();
  current.splice(index, 1);
  saveOrder(current);
  return current;
}

export function clearOrder() {
  saveOrder([]);
}

export function buildMailto({ name, email, items }) {
  const to = "cozyandcontentbooks@gmail.com";
  const subject = encodeURIComponent("Wishlist Order Request");
  const lines = [];
  lines.push(`Name: ${name || ""}`);
  lines.push(`Email: ${email || ""}`);
  lines.push("");
  lines.push("I'd like to order the following titles:");
  lines.push("");
  items.forEach((b, idx) => {
    lines.push(`${idx + 1}. ${b.title}${b.author ? " — " + b.author : ""}${b.isbn ? " (ISBN: " + b.isbn + ")" : ""}`);
  });
  lines.push("");
  lines.push("Notes:");
  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
