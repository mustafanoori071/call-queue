export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const passcode = process.env.TEAM_PASSCODE;
  if (!passcode) {
    return res.status(200).json({ required: false, ok: true });
  }

  const code = req.body?.code ?? "";
  return res.status(200).json({
    required: true,
    ok: code === passcode,
  });
}
