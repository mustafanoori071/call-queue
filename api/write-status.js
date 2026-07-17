export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const writeUrl = process.env.SHEET_WRITE_URL;
  if (!writeUrl) {
    return res.status(503).json({ ok: false, error: "SHEET_WRITE_URL is not configured" });
  }

  const { row, status, calledBy, note } = req.body || {};
  if (!row || !status) {
    return res.status(400).json({ ok: false, error: "row and status are required" });
  }

  try {
    const upstream = await fetch(writeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row, status, calledBy: calledBy || "", note: note || "" }),
      redirect: "follow",
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!upstream.ok) {
      return res.status(502).json({ ok: false, error: "Sheet write failed", detail: payload });
    }

    return res.status(200).json({ ok: true, ...payload });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message || "Sheet write failed" });
  }
}
