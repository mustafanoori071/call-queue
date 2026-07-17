export const OUTCOMES = [
  { id: "interested", label: "Interested", tone: "success", swipe: "right" },
  { id: "no_answer", label: "No answer", tone: "muted" },
  { id: "voicemail", label: "Voicemail", tone: "info" },
  { id: "not_interested", label: "Not interested", tone: "danger" },
  { id: "callback", label: "Call back", tone: "warning", needsCallback: true },
  { id: "bad_number", label: "Bad number", tone: "danger" },
  { id: "skipped", label: "Skip", tone: "muted", swipe: "left" },
];

export const OUTCOME_BY_ID = Object.fromEntries(OUTCOMES.map((o) => [o.id, o]));

// Only these mean "still in the queue"
export const UNCALLED_MARKERS = [
  "not called yet",
  "not called",
  "uncalled",
  "new",
  "pending",
  "to call",
];

// Legacy sheet values still count as already processed
export const LEGACY_CALLED_MARKERS = [
  "booked/website!",
  "booked/ no show",
  "closed",
  "called",
  "done",
  "completed",
  "contacted",
  "yes",
];

export const CALLED_MARKERS = [
  ...OUTCOMES.map((o) => o.label.toLowerCase()),
  ...LEGACY_CALLED_MARKERS,
];

export function outcomeToSheetStatus(result) {
  return OUTCOME_BY_ID[result]?.label || result;
}

export function outcomeToneClass(tone) {
  switch (tone) {
    case "success":
      return "text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10";
    case "danger":
      return "text-red-400 border-red-500/40 hover:bg-red-500/10";
    case "warning":
      return "text-amber-400 border-amber-500/40 hover:bg-amber-500/10";
    case "info":
      return "text-sky-400 border-sky-500/40 hover:bg-sky-500/10";
    default:
      return "text-slate-400 border-slate-500/40 hover:bg-slate-500/10";
  }
}

export function outcomeBadgeClass(tone) {
  switch (tone) {
    case "success":
      return "text-emerald-400";
    case "danger":
      return "text-red-400";
    case "warning":
      return "text-amber-400";
    case "info":
      return "text-sky-400";
    default:
      return "text-slate-400";
  }
}
