"use client";
import { useEffect, useState } from "react";
import { ensureAuth } from "@/lib/firebase";
import { ensureShareForList } from "@/lib/wishlists";

export default function RepairShare() {
  const [uid, setUid] = useState(null);
  const [listId, setListId] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      const u = await ensureAuth({ allowAnonymous: false });
      setUid(u?.uid || null);
    })();
  }, []);

  async function onRepair(e) {
    e.preventDefault();
    if (!uid || !listId) return;
    setStatus("Repairing…");
    try {
      const shareId = await ensureShareForList(uid, listId.trim());
      setStatus(`Done. Share link: ${location.origin}/s/${shareId}`);
    } catch (e) {
      console.error(e);
      setStatus("Failed to repair.");
    }
  }

  if (!uid) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Repair Share</h1>
      <form onSubmit={onRepair} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <label>List ID
          <input
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            placeholder="your list doc id"
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </label>
        <button className="cc-btn" type="submit">Repair</button>
      </form>
      {status && <p style={{ marginTop: 10 }}>{status}</p>}
    </main>
  );
}
