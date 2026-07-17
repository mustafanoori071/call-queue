import Papa from "papaparse";

const GUESS = {
  name: ["name", "contact", "business", "company", "lead"],
  phone: ["phone", "number", "mobile", "cell", "tel"],
  business: ["business", "company", "org", "account"],
  notes: ["notes", "note", "info", "comment"],
  status: ["status", "result", "outcome", "called", "disposition"],
};

export function guessColumn(headers, key) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of GUESS[key]) {
    const idx = lower.findIndex((h) => h.includes(kw));
    if (idx !== -1) return headers[idx];
  }
  return "";
}

export function defaultMapping(headers) {
  return {
    name: guessColumn(headers, "name"),
    phone: guessColumn(headers, "phone"),
    business: guessColumn(headers, "business"),
    notes: guessColumn(headers, "notes"),
    status: guessColumn(headers, "status"),
  };
}

export function normalizeSheetUrl(input) {
  const trimmed = input.trim();
  const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (idMatch && idMatch[1] !== "e") {
    const id = idMatch[1];
    return {
      url: `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
      type: "gviz",
    };
  }

  if (trimmed.includes("/pub") || trimmed.includes("export?format=csv")) {
    return { url: trimmed, type: "published" };
  }

  return { url: trimmed, type: "unknown" };
}

export function parseSheetText(text) {
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  if (!parsed.data.length) throw new Error("No rows found in that data.");
  const headers = parsed.meta.fields || [];
  const rows = parsed.data.map((row, i) => ({
    ...row,
    _sheetRow: i + 2,
  }));
  return { headers, rows, mapping: defaultMapping(headers) };
}

export function getTeamSheetUrl() {
  return (import.meta.env.VITE_SHEET_URL || "").trim();
}

export function isTeamMode() {
  return Boolean(getTeamSheetUrl());
}

export async function fetchLiveTeamSheet() {
  const sheetUrl = getTeamSheetUrl();
  if (!sheetUrl) throw new Error("VITE_SHEET_URL is not configured.");
  return fetchSheetText(sheetUrl);
}

export async function fetchSheetText(sheetUrl) {
  const { url, type } = normalizeSheetUrl(sheetUrl);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      "Sheet didn't respond. Set sharing to Anyone with the link — Viewer, or use Paste data."
    );
  }
  const text = await res.text();
  if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
    throw new Error(
      "Got a web page instead of CSV. Use a share link or published CSV URL, or paste the data."
    );
  }
  if (!text.trim()) {
    throw new Error("Sheet came back empty. Check the tab (gid) and sharing settings.");
  }
  return { text, type };
}

export function toTelHref(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (!digits.startsWith("+")) {
    const bare = digits.replace(/\D/g, "");
    if (bare.length === 10) digits = "+1" + bare;
    else if (bare.length === 11 && bare.startsWith("1")) digits = "+" + bare;
    else digits = bare;
  }
  return `tel:${digits}`;
}
