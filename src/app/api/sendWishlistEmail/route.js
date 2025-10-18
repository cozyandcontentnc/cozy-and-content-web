import { NextResponse } from "next/server";
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.ORDERS_EMAIL_FROM || "Cozy & Content <orders@example.com>";
const STORE_EMAIL = process.env.ORDERS_EMAIL_TO || "cozyandcontentbooks@gmail.com";

// Your Libro.fm storefront slug (update if needed)
const LIBRO_SLUG = "cozyandcontentnc";

function libroLink(title, author) {
  const q = encodeURIComponent([title || "", author || ""].join(" ").trim());
  return `https://libro.fm/${LIBRO_SLUG}/search?query=${q}`;
}

function renderRow(item) {
  const title = item.title || "Unknown";
  const authors = (item.authors || []).join(", ");
  const isbn = item.isbn || "";
  const cover = item.coverUrl ? `<img src="${item.coverUrl}" width="72" style="border-radius:6px;display:block" />` : "";
  const fmt = item.format || "—";
  const notes = item.notes ? `<div style="font-size:12px;opacity:.8;margin-top:4px;"><strong>Notes:</strong> ${item.notes}</div>` : "";
  const libroUrl = item.libroUrl || libroLink(item.title, (item.authors || [])[0]);

  const mailto = `mailto:${encodeURIComponent(STORE_EMAIL)}?subject=${encodeURIComponent(
    `Order Request: ${title}`
  )}&body=${encodeURIComponent(
    `Hi Cozy & Content,%0D%0A%0D%0ATitle: ${title}%0D%0AAuthor(s): ${authors}%0D%0AISBN: ${isbn}%0D%0APreferred format: ${fmt}%0D%0A${item.notes ? `Notes: ${item.notes}%0D%0A` : ""}`
  )}`;

  return `<tr>
    <td style="padding:12px;border-bottom:1px solid #eee;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;padding-right:12px;">${cover}</td>
          <td style="vertical-align:top;">
            <div style="font-weight:700">${title}</div>
            <div style="font-size:13px;opacity:.85">${authors}</div>
            <div style="font-size:12px;opacity:.7;margin-top:4px">ISBN: ${isbn} • Format: ${fmt}</div>
            ${notes}
            <div style="margin-top:8px;">
              <a href="${mailto}" style="background:#111;color:#fff;text-decoration:none;padding:8px 10px;border-radius:6px;font-size:13px;margin-right:8px;display:inline-block;">Ask Cozy & Content to order</a>
              <a href="${libroUrl}" style="background:#f2f2f2;color:#111;text-decoration:none;padding:8px 10px;border-radius:6px;font-size:13px;display:inline-block;">Gift on Libro.fm</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderHtml(items = [], publicUrl) {
  const rows = items.map(renderRow).join("");
  const openBtn = publicUrl
    ? `<a href="${publicUrl}" style="background:#6b46c1;color:#fff;text-decoration:none;padding:10px 12px;border-radius:8px;font-weight:600;display:inline-block;">Open Wishlist Online</a>`
    : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#fafafa;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <table width="100%"><tr><td align="center" style="padding:24px;">
      <table width="640" style="background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 24px 8px 24px;">
          <div style="font-size:20px;font-weight:800;">Your Cozy & Content Wishlist</div>
          <div style="font-size:13px;opacity:.75;margin-top:4px;">Scan books in-store, then order from us or gift on Libro.fm.</div>
          <div style="margin-top:12px;">${openBtn}</div>
        </td></tr>
        <tr><td><table width="100%">${rows || `<tr><td style="padding:24px">No items yet.</td></tr>`}</table></td></tr>
        <tr><td style="padding:16px 24px 24px 24px;font-size:12px;opacity:.65;">Purchases support Cozy & Content.</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

export async function POST(req) {
  try {
    if (!RESEND_API_KEY) return NextResponse.json({ error: "Missing RESEND_API_KEY" }, { status: 500 });

    const { items = [], publicUrl, toEmail } = await req.json();
    const resend = new Resend(RESEND_API_KEY);
    const recipient = toEmail || STORE_EMAIL;

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [recipient],
      subject: "Your Cozy & Content Wishlist",
      html: renderHtml(items, publicUrl),
    });

    if (error) return NextResponse.json({ error }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
