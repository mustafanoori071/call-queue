import React, { useState, useRef, useMemo } from "react";
import Papa from "papaparse";
import { Phone, Search, X, Check, RotateCcw, Link2, ChevronRight } from "lucide-react";

// ---- helpers ----------------------------------------------------------

function normalizeSheetUrl(input) {
  const trimmed = input.trim();
  const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  // Regular share/edit link -> real spreadsheet ID -> gviz endpoint (supports cross-origin fetch)
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (idMatch && idMatch[1] !== "e") {
    const id = idMatch[1];
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
  }
  // Published pub-link (docs.google.com/.../d/e/.../pub) — used as a fallback as-is
  return trimmed;
}

function toTelHref(raw) {
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

const GUESS = {
  name: ["name", "contact", "business", "company", "lead"],
  phone: ["phone", "number", "mobile", "cell", "tel"],
  business: ["business", "company", "org", "account"],
  notes: ["notes", "note", "status", "info", "comment"],
};

function guessColumn(headers, key) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of GUESS[key]) {
    const idx = lower.findIndex((h) => h.includes(kw));
    if (idx !== -1) return headers[idx];
  }
  return "";
}

// ---- odometer-style counter --------------------------------------------

function Odometer({ value, total }) {
  return (
    <div className="flex items-baseline gap-2 font-mono tabular-nums">
      <span className="text-3xl font-semibold text-[#F4EFE6]">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-sm text-[#8A8378]">/ {String(total).padStart(2, "0")}</span>
    </div>
  );
}

// ---- main app -----------------------------------------------------------

export default function CallQueue() {
  const [stage, setStage] = useState("connect"); // connect | map | queue | done
  const [inputMode, setInputMode] = useState("paste"); // paste | url
  const [sheetUrl, setSheetUrl] = useState("");
  const [pastedCsv, setPastedCsv] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({ name: "", phone: "", business: "", notes: "" });

  const [queue, setQueue] = useState([]); // filtered, mapped leads
  const [index, setIndex] = useState(0);
  const [called, setCalled] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [log, setLog] = useState([]); // {name, phone, result}

  const dragStart = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const current = queue[index];
  const remaining = queue.length - index;

  function parseAndProceed(text) {
    const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
    if (!parsed.data.length) throw new Error("No rows found in that data.");
    const hdrs = parsed.meta.fields || [];
    setHeaders(hdrs);
    setRows(parsed.data);
    setMapping({
      name: guessColumn(hdrs, "name"),
      phone: guessColumn(hdrs, "phone"),
      business: guessColumn(hdrs, "business"),
      notes: guessColumn(hdrs, "notes"),
    });
    setStage("map");
  }

  function handleLoadPaste() {
    setError("");
    if (!pastedCsv.trim()) {
      setError("Paste your sheet data first.");
      return;
    }
    try {
      parseAndProceed(pastedCsv);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleLoadUrl() {
    setError("");
    if (!sheetUrl.trim()) {
      setError("Paste a Google Sheet link first.");
      return;
    }
    setLoading(true);
    try {
      const url = normalizeSheetUrl(sheetUrl);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Sheet didn't respond — check sharing is set to Viewer.");
      const text = await res.text();
      parseAndProceed(text);
    } catch (e) {
      setError(
        "Couldn't reach that sheet from here — this environment blocks outbound requests to external sites. Use \"Paste data\" instead, it's the reliable path."
      );
    } finally {
      setLoading(false);
    }
  }

  function buildQueue() {
    const built = rows
      .map((r) => ({
        name: mapping.name ? r[mapping.name] : "",
        phone: mapping.phone ? r[mapping.phone] : "",
        business: mapping.business ? r[mapping.business] : "",
        notes: mapping.notes ? r[mapping.notes] : "",
      }))
      .filter((r) => r.phone && String(r.phone).trim());
    if (!built.length) {
      setError("None of the rows have a value in the phone column you picked.");
      return;
    }
    setQueue(built);
    setIndex(0);
    setCalled(0);
    setSkipped(0);
    setLog([]);
    setStage("queue");
  }

  function advance(result) {
    if (!current) return;
    setLog((l) => [...l, { name: current.name, phone: current.phone, result }]);
    if (result === "called") setCalled((c) => c + 1);
    if (result === "skipped") setSkipped((s) => s + 1);
    setDragX(0);
    if (index + 1 >= queue.length) {
      setIndex(index + 1);
      setStage("done");
    } else {
      setIndex((i) => i + 1);
    }
  }

  function onDragStart(clientX) {
    dragStart.current = clientX;
    setDragging(true);
  }
  function onDragMove(clientX) {
    if (dragStart.current === null) return;
    setDragX(clientX - dragStart.current);
  }
  function onDragEnd() {
    setDragging(false);
    dragStart.current = null;
    if (dragX > 90) advance("called");
    else if (dragX < -90) advance("skipped");
    else setDragX(0);
  }

  const rotation = Math.max(-12, Math.min(12, dragX / 10));

  function searchLead() {
    if (!current) return;
    const q = encodeURIComponent(`${current.business || current.name}`.trim());
    window.open(`https://www.google.com/search?q=${q}`, "_blank");
  }

  // ---- render ----

  return (
    <div className="min-h-screen w-full bg-[#16161A] flex flex-col items-center justify-center p-5 font-sans">
      <style>{`
        @font-face { font-family: 'ui-fallback'; src: local('Georgia'); }
        .digit-label { letter-spacing: 0.14em; }
      `}</style>

      {stage === "connect" && (
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 rounded-full bg-[#C9773B] flex items-center justify-center mx-auto mb-4">
              <Phone size={20} className="text-[#16161A]" />
            </div>
            <h1 className="text-2xl font-semibold text-[#F4EFE6] mb-1">Call Queue</h1>
            <p className="text-sm text-[#8A8378]">
              Load your sheet. One lead at a time — no more scanning rows.
            </p>
          </div>

          <div className="flex gap-1 bg-[#1F1E22] border border-[#332F2A] rounded-lg p-1 mb-4">
            <button
              onClick={() => setInputMode("paste")}
              className={`flex-1 text-xs font-medium rounded-md py-2 transition-colors ${
                inputMode === "paste" ? "bg-[#C9773B] text-[#16161A]" : "text-[#8A8378]"
              }`}
            >
              Paste data
            </button>
            <button
              onClick={() => setInputMode("url")}
              className={`flex-1 text-xs font-medium rounded-md py-2 transition-colors ${
                inputMode === "url" ? "bg-[#C9773B] text-[#16161A]" : "text-[#8A8378]"
              }`}
            >
              Sheet link
            </button>
          </div>

          {inputMode === "paste" && (
            <>
              <label className="block text-xs uppercase digit-label text-[#8A8378] mb-2">
                Your sheet data
              </label>
              <textarea
                className="w-full h-36 bg-[#1F1E22] border border-[#332F2A] rounded-xl px-3 py-3 mb-2 text-[#F4EFE6] text-xs font-mono outline-none placeholder:text-[#5C574E] resize-none"
                placeholder="Name, Phone, Business, Notes..."
                value={pastedCsv}
                onChange={(e) => setPastedCsv(e.target.value)}
              />
              <p className="text-xs text-[#5C574E] mb-4 leading-relaxed">
                In Sheets: select your data (Ctrl/Cmd+A), copy, then paste here — headers and all.
                This is the reliable option since it doesn't depend on live network access.
              </p>
              {error && <p className="text-xs text-[#D9765F] mb-4">{error}</p>}
              <button
                onClick={handleLoadPaste}
                className="w-full bg-[#C9773B] hover:bg-[#B8672E] text-[#16161A] font-medium rounded-xl py-3 transition-colors"
              >
                Load data
              </button>
            </>
          )}

          {inputMode === "url" && (
            <>
              <label className="block text-xs uppercase digit-label text-[#8A8378] mb-2">
                Google Sheet link
              </label>
              <div className="flex items-center gap-2 bg-[#1F1E22] border border-[#332F2A] rounded-xl px-3 py-3 mb-2">
                <Link2 size={16} className="text-[#8A8378] shrink-0" />
                <input
                  className="bg-transparent outline-none text-[#F4EFE6] text-sm w-full placeholder:text-[#5C574E]"
                  placeholder="Paste the sheet URL"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                />
              </div>
              <p className="text-xs text-[#5C574E] mb-4 leading-relaxed">
                Share access set to "Anyone with the link — Viewer." Heads up: this environment
                often blocks outbound requests to external sites, so if this fails, use "Paste
                data" instead.
              </p>
              {error && <p className="text-xs text-[#D9765F] mb-4">{error}</p>}
              <button
                onClick={handleLoadUrl}
                disabled={loading}
                className="w-full bg-[#C9773B] hover:bg-[#B8672E] disabled:opacity-50 text-[#16161A] font-medium rounded-xl py-3 transition-colors"
              >
                {loading ? "Connecting…" : "Load sheet"}
              </button>
            </>
          )}
        </div>
      )}

      {stage === "map" && (
        <div className="w-full max-w-sm">
          <h2 className="text-lg font-semibold text-[#F4EFE6] mb-1">Match your columns</h2>
          <p className="text-xs text-[#8A8378] mb-6">
            {rows.length} rows found. Confirm which column is which.
          </p>

          {["name", "phone", "business", "notes"].map((key) => (
            <div key={key} className="mb-4">
              <label className="block text-xs uppercase digit-label text-[#8A8378] mb-1.5">
                {key} {key === "phone" && <span className="text-[#C9773B]">(required)</span>}
              </label>
              <select
                className="w-full bg-[#1F1E22] border border-[#332F2A] rounded-lg px-3 py-2.5 text-sm text-[#F4EFE6] outline-none"
                value={mapping[key]}
                onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
              >
                <option value="">— none —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {error && <p className="text-xs text-[#D9765F] mb-4">{error}</p>}

          <button
            onClick={buildQueue}
            disabled={!mapping.phone}
            className="w-full bg-[#C9773B] disabled:opacity-40 hover:bg-[#B8672E] text-[#16161A] font-medium rounded-xl py-3 transition-colors flex items-center justify-center gap-1"
          >
            Start dialing <ChevronRight size={16} />
          </button>
        </div>
      )}

      {stage === "queue" && current && (
        <div className="w-full max-w-sm flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-6 px-1">
            <Odometer value={index} total={queue.length} />
            <span className="text-xs text-[#8A8378]">{remaining} left</span>
          </div>

          <div
            className="relative w-full h-72 mb-6 select-none"
            style={{ touchAction: "pan-y" }}
            onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
            onTouchMove={(e) => onDragMove(e.touches[0].clientX)}
            onTouchEnd={onDragEnd}
            onMouseDown={(e) => onDragStart(e.clientX)}
            onMouseMove={(e) => dragging && onDragMove(e.clientX)}
            onMouseUp={onDragEnd}
            onMouseLeave={() => dragging && onDragEnd()}
          >
            {/* next card peeking behind */}
            {queue[index + 1] && (
              <div className="absolute inset-0 bg-[#1F1E22] border border-[#2A2823] rounded-2xl translate-y-2 scale-[0.96] opacity-60" />
            )}

            <div
              className="absolute inset-0 bg-[#1F1E22] border border-[#332F2A] rounded-2xl p-6 flex flex-col justify-between shadow-xl cursor-grab active:cursor-grabbing"
              style={{
                transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
                transition: dragging ? "none" : "transform 0.25s ease",
              }}
            >
              <div
                className={`absolute top-4 right-5 text-xs font-semibold digit-label ${
                  dragX > 40 ? "text-[#6FBF8E] opacity-100" : "opacity-0"
                } transition-opacity`}
              >
                CALLED
              </div>
              <div
                className={`absolute top-4 left-5 text-xs font-semibold digit-label ${
                  dragX < -40 ? "text-[#D9765F] opacity-100" : "opacity-0"
                } transition-opacity`}
              >
                SKIP
              </div>

              <div>
                <p className="text-xs uppercase digit-label text-[#8A8378] mb-2">
                  {current.business || "Lead"}
                </p>
                <h3 className="text-2xl font-semibold text-[#F4EFE6] leading-tight mb-3">
                  {current.name || "—"}
                </h3>
                <a href={toTelHref(current.phone) || "#"} className="text-lg font-mono text-[#C9773B] underline decoration-dotted underline-offset-4">
                  {current.phone}
                </a>
              </div>

              {current.notes && (
                <p className="text-sm text-[#8A8378] leading-relaxed line-clamp-4">
                  {current.notes}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mb-5">
            <button
              onClick={() => advance("skipped")}
              className="w-12 h-12 rounded-full border border-[#332F2A] flex items-center justify-center text-[#8A8378] hover:border-[#D9765F] hover:text-[#D9765F] transition-colors"
              aria-label="Skip"
            >
              <X size={18} />
            </button>

            <a
              href={toTelHref(current?.phone) || "#"}
              className="w-16 h-16 rounded-full bg-[#C9773B] hover:bg-[#B8672E] flex items-center justify-center text-[#16161A] transition-colors shadow-lg"
              aria-label="Call"
            >
              <Phone size={24} />
            </a>

            <button
              onClick={() => advance("called")}
              className="w-12 h-12 rounded-full border border-[#332F2A] flex items-center justify-center text-[#8A8378] hover:border-[#6FBF8E] hover:text-[#6FBF8E] transition-colors"
              aria-label="Mark called"
            >
              <Check size={18} />
            </button>
          </div>

          <button
            onClick={searchLead}
            className="flex items-center gap-1.5 text-xs text-[#8A8378] hover:text-[#F4EFE6] transition-colors"
          >
            <Search size={13} /> Look up {current.business || current.name || "this lead"}
          </button>

          <p className="text-[11px] text-[#5C574E] mt-6 text-center leading-relaxed">
            Swipe right or tap ✓ once you've called. Swipe left or tap ✕ to skip.
          </p>
        </div>
      )}

      {stage === "done" && (
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-[#6FBF8E] flex items-center justify-center mx-auto mb-5">
            <Check size={24} className="text-[#16161A]" />
          </div>
          <h2 className="text-xl font-semibold text-[#F4EFE6] mb-1">Queue cleared</h2>
          <p className="text-sm text-[#8A8378] mb-6">
            {called} called · {skipped} skipped · {queue.length} total
          </p>

          <div className="text-left bg-[#1F1E22] border border-[#332F2A] rounded-xl p-4 mb-6 max-h-56 overflow-y-auto">
            {log.map((l, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 text-sm border-b border-[#2A2823] last:border-0"
              >
                <span className="text-[#F4EFE6] truncate pr-2">{l.name || l.phone}</span>
                <span
                  className={`text-xs shrink-0 ${
                    l.result === "called" ? "text-[#6FBF8E]" : "text-[#D9765F]"
                  }`}
                >
                  {l.result}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              setStage("connect");
              setSheetUrl("");
            }}
            className="w-full flex items-center justify-center gap-1.5 bg-[#C9773B] hover:bg-[#B8672E] text-[#16161A] font-medium rounded-xl py-3 transition-colors"
          >
            <RotateCcw size={15} /> Load another sheet
          </button>
        </div>
      )}
    </div>
  );
}
