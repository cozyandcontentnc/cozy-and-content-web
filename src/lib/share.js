// lib/share.js
export async function shareText(title, text, url) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch {
      // user cancelled; fall through
    }
  }
  try {
    await navigator.clipboard.writeText([title, text, url].filter(Boolean).join("\n"));
    alert("Copied to clipboard!");
  } catch {
    prompt("Copy this:", [title, text, url].filter(Boolean).join("\n"));
  }
}
