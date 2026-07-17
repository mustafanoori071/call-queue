import { outcomeToSheetStatus } from "./outcomes";

export async function writeStatusToSheet({ row, result, calledBy, note }) {
  const status = outcomeToSheetStatus(result);
  if (!row || !status) return { ok: false, skipped: true };

  const res = await fetch("/api/write-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      row,
      status,
      calledBy: calledBy || "",
      note: note || "",
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to update the sheet");
  }
  return data;
}
