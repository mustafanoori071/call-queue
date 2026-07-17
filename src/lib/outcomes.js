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

export const CALLED_MARKERS = [
  "called",
  "done",
  "completed",
  "contacted",
  "interested",
  "not interested",
  "no answer",
  "voicemail",
  "callback",
  "bad number",
  "skipped",
  "yes",
];

const SHEET_STATUS = {
  interested: "interested",
  no_answer: "no answer",
  voicemail: "voicemail",
  not_interested: "not interested",
  callback: "callback",
  bad_number: "bad number",
  skipped: "skipped",
};

export function outcomeToSheetStatus(result) {
  return SHEET_STATUS[result] || result;
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
