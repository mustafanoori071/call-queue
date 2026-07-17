import Papa from "papaparse";

export function exportResultsCsv(log) {
  const rows = log.map((entry) => ({
    name: entry.name || "",
    phone: entry.phone || "",
    business: entry.business || "",
    sheet_notes: entry.sheetNotes || "",
    outcome: entry.result || "",
    call_note: entry.callNote || "",
    callback_at: entry.callbackAt || "",
    recorded_at: entry.recordedAt || "",
  }));

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `call-queue-results-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function computeAnalytics(log, queueLength) {
  const counts = {};
  for (const entry of log) {
    counts[entry.result] = (counts[entry.result] || 0) + 1;
  }

  const contacted = log.filter((e) => e.result !== "skipped").length;
  const interested = counts.interested || 0;
  const callbacks = counts.callback || 0;
  const badNumbers = counts.bad_number || 0;
  const noAnswer = counts.no_answer || 0;
  const voicemail = counts.voicemail || 0;
  const notInterested = counts.not_interested || 0;
  const skipped = counts.skipped || 0;

  return {
    total: queueLength,
    processed: log.length,
    contacted,
    interested,
    callbacks,
    badNumbers,
    noAnswer,
    voicemail,
    notInterested,
    skipped,
    contactRate: queueLength ? Math.round((contacted / queueLength) * 100) : 0,
    interestRate: contacted ? Math.round((interested / contacted) * 100) : 0,
    counts,
  };
}
