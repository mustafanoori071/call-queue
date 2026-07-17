import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Phone,
  Search,
  Check,
  RotateCcw,
  Link2,
  ChevronRight,
  Download,
  Bell,
  Smartphone,
  Share,
  Clock,
  BarChart3,
  Filter,
  RefreshCw,
  User,
} from "lucide-react";
import { theme } from "./lib/theme";
import {
  OUTCOMES,
  OUTCOME_BY_ID,
  outcomeToneClass,
  outcomeBadgeClass,
  CALLED_MARKERS,
  UNCALLED_MARKERS,
} from "./lib/outcomes";
import { loadSession, saveSession, clearSession, formatSavedAt } from "./lib/storage";
import {
  parseSheetText,
  fetchSheetText,
  fetchLiveTeamSheet,
  getTeamSheetUrl,
  isTeamMode,
  toTelHref,
} from "./lib/sheet";
import { exportResultsCsv, computeAnalytics } from "./lib/export";
import {
  isUnlocked,
  checkPasscodeRequired,
  getCallerName,
  setCallerName,
  clearUnlock,
} from "./lib/auth";
import { writeStatusToSheet } from "./lib/sheetWrite";
import PasscodeGate from "./components/PasscodeGate";

const EMPTY_MAPPING = { name: "", phone: "", business: "", vertical: "", city: "", notes: "", status: "" };
const EMPTY_FILTERS = { skipAlreadyCalled: true, onlyEmptyStatus: false };

function Odometer({ value, total }) {
  return (
    <div className="flex items-baseline gap-2 font-mono tabular-nums">
      <span className="text-3xl font-semibold" style={{ color: theme.text }}>
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-sm" style={{ color: theme.textMuted }}>
        / {String(total).padStart(2, "0")}
      </span>
    </div>
  );
}

function InstallBanner({ onDismiss }) {
  const [deferred, setDeferred] = useState(null);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isStandalone) return null;

  return (
    <div
      className="w-full max-w-sm mb-4 rounded-xl border p-4"
      style={{ background: theme.surfaceRaised, borderColor: theme.border }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: theme.accent }}
        >
          <Smartphone size={16} style={{ color: theme.bg }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium mb-1" style={{ color: theme.text }}>
            Install on your phone
          </p>
          {deferred ? (
            <p className="text-xs leading-relaxed mb-3" style={{ color: theme.textMuted }}>
              Add Call Queue to your home screen for full-screen dialing.
            </p>
          ) : isIos ? (
            <p className="text-xs leading-relaxed mb-3" style={{ color: theme.textMuted }}>
              Tap <Share size={11} className="inline -mt-0.5" /> Share, then <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <p className="text-xs leading-relaxed mb-3" style={{ color: theme.textMuted }}>
              Open this page on your phone and use your browser&apos;s install or Add to Home Screen option.
            </p>
          )}
          <div className="flex gap-2">
            {deferred && (
              <button
                onClick={async () => {
                  deferred.prompt();
                  await deferred.userChoice;
                  setDeferred(null);
                  onDismiss?.();
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: theme.accent, color: "#fff" }}
              >
                Install
              </button>
            )}
            <button
              onClick={onDismiss}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ color: theme.textMuted }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isAlreadyCalled(statusValue) {
  if (!statusValue) return false;
  const lower = String(statusValue).toLowerCase().trim();
  return CALLED_MARKERS.some((m) => lower.includes(m));
}

function shouldSkipByStatus(statusValue, team) {
  const value = String(statusValue || "").trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (UNCALLED_MARKERS.some((m) => lower.includes(m))) return false;
  if (team) return true;
  return isAlreadyCalled(value);
}

export default function CallQueue() {
  const teamMode = isTeamMode();
  const [stage, setStage] = useState(teamMode ? "locked" : "connect");
  const [inputMode, setInputMode] = useState(teamMode ? "url" : "paste");
  const [sheetUrl, setSheetUrl] = useState(getTeamSheetUrl());
  const [pastedCsv, setPastedCsv] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState(EMPTY_MAPPING);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, skipAlreadyCalled: teamMode });
  const [filterPreview, setFilterPreview] = useState(null);

  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState([]);
  const [callbacks, setCallbacks] = useState([]);
  const [callNote, setCallNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [pendingOutcome, setPendingOutcome] = useState(null);
  const [showInstall, setShowInstall] = useState(true);
  const [showFallback, setShowFallback] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  const [authChecked, setAuthChecked] = useState(!teamMode);
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [callerName, setCallerNameState] = useState(getCallerName());
  const [callerInput, setCallerInput] = useState(getCallerName());

  const [savedSession, setSavedSession] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const dragStart = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const current = queue[index];
  const remaining = Math.max(queue.length - index, 0);
  const analytics = useMemo(() => computeAnalytics(log, queue.length), [log, queue.length]);

  const dueCallbacks = useMemo(() => {
    const now = Date.now();
    return callbacks
      .filter((c) => c.callbackAt && new Date(c.callbackAt).getTime() <= now)
      .sort((a, b) => new Date(a.callbackAt) - new Date(b.callbackAt));
  }, [callbacks]);

  const upcomingCallbacks = useMemo(() => {
    const now = Date.now();
    return callbacks
      .filter((c) => c.callbackAt && new Date(c.callbackAt).getTime() > now)
      .sort((a, b) => new Date(a.callbackAt) - new Date(b.callbackAt));
  }, [callbacks]);

  useEffect(() => {
    const session = loadSession();
    if (session?.stage && session.stage !== "connect" && session.stage !== "locked" && session.stage !== "caller") {
      setSavedSession(session);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!teamMode) {
      setAuthChecked(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const required = await checkPasscodeRequired();
        if (cancelled) return;
        setPasscodeRequired(required);
        if (!required || isUnlocked()) {
          if (!getCallerName()) setStage("caller");
          else {
            setCallerNameState(getCallerName());
            setStage("connect");
          }
        } else {
          setStage("locked");
        }
      } catch {
        if (!cancelled) setError("Could not verify team access.");
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamMode]);

  const persist = useCallback(
    (overrides = {}) => {
      if (!hydrated) return;
      saveSession({
        stage,
        inputMode,
        sheetUrl,
        pastedCsv,
        headers,
        rows,
        mapping,
        filters,
        queue,
        index,
        log,
        callbacks,
        callerName,
        ...overrides,
      });
    },
    [hydrated, stage, inputMode, sheetUrl, pastedCsv, headers, rows, mapping, filters, queue, index, log, callbacks, callerName]
  );

  useEffect(() => {
    persist();
  }, [persist]);

  function applySession(session) {
    setStage(session.stage || "connect");
    setInputMode(session.inputMode || "paste");
    setSheetUrl(session.sheetUrl || "");
    setPastedCsv(session.pastedCsv || "");
    setHeaders(session.headers || []);
    setRows(session.rows || []);
    setMapping(session.mapping || EMPTY_MAPPING);
    setFilters(session.filters || EMPTY_FILTERS);
    setQueue(session.queue || []);
    setIndex(session.index || 0);
    setLog(session.log || []);
    setCallbacks(session.callbacks || []);
    setCallerNameState(session.callerName || getCallerName());
    setSavedSession(null);
    setError("");
  }

  function handleUnlock() {
    if (!getCallerName()) {
      setStage("caller");
      return;
    }
    setCallerNameState(getCallerName());
    setStage("connect");
  }

  function handleCallerSubmit() {
    const name = setCallerName(callerInput);
    if (!name) {
      setError("Enter your name so the team knows who called each lead.");
      return;
    }
    setCallerNameState(name);
    setError("");
    setStage("connect");
  }

  function resetAll() {
    clearSession();
    if (teamMode && passcodeRequired) clearUnlock();
    setStage(teamMode && passcodeRequired && !isUnlocked() ? "locked" : teamMode && !getCallerName() ? "caller" : "connect");
    setInputMode("paste");
    setSheetUrl("");
    setPastedCsv("");
    setError("");
    setHeaders([]);
    setRows([]);
    setMapping(EMPTY_MAPPING);
    setFilters(EMPTY_FILTERS);
    setFilterPreview(null);
    setQueue([]);
    setIndex(0);
    setLog([]);
    setCallbacks([]);
    setCallNote("");
    setCallbackAt("");
    setPendingOutcome(null);
    setSavedSession(null);
    setSyncStatus("");
    setShowFallback(false);
  }

  function applyParsedSheet(parsed, { autoStart = false } = {}) {
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(parsed.mapping);
    setFilterPreview(null);

    if (autoStart && parsed.mapping.phone) {
      const built = buildMappedLeadsFrom(parsed.rows, parsed.mapping).filter((r) => {
        if (!r.phone || !String(r.phone).trim()) return false;
        if (parsed.mapping.status && filters.skipAlreadyCalled && shouldSkipByStatus(r.status, teamMode)) return false;
        if (parsed.mapping.status && filters.onlyEmptyStatus && String(r.status || "").trim()) return false;
        return true;
      });

      if (!built.length) {
        setError("No uncalled leads left in the team sheet.");
        setStage("connect");
        return;
      }

      setQueue(built);
      setIndex(0);
      setLog([]);
      setCallNote("");
      setCallbackAt("");
      setPendingOutcome(null);
      setStage("queue");
      setError("");
      return;
    }

    setStage("map");
  }

  function parseAndProceed(text, options) {
    const parsed = parseSheetText(text);
    applyParsedSheet(parsed, options);
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

  async function handleLoadTeamSheet() {
    setError("");
    setLoading(true);
    try {
      const { text } = await fetchLiveTeamSheet();
      parseAndProceed(text, { autoStart: true });
    } catch (e) {
      setError(`${e.message} Use manual fallback if needed.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshTeamSheet() {
    if (!teamMode) return;
    setSyncStatus("Refreshing…");
    setLoading(true);
    try {
      const { text } = await fetchLiveTeamSheet();
      const parsed = parseSheetText(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(parsed.mapping);

      const fresh = buildMappedLeadsFrom(parsed.rows, parsed.mapping).filter((r) => {
        if (!r.phone || !String(r.phone).trim()) return false;
        if (parsed.mapping.status && shouldSkipByStatus(r.status, true)) return false;
        return true;
      });

      const processedRows = new Set(log.map((l) => l.sheetRow).filter(Boolean));
      const remaining = fresh.filter((lead) => !processedRows.has(lead.sheetRow));
      setQueue(remaining);
      setIndex(0);
      setSyncStatus(remaining.length ? `${remaining.length} leads ready` : "No uncalled leads left");
    } catch (e) {
      setSyncStatus("");
      setError(e.message);
    } finally {
      setLoading(false);
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
      const { text, type } = await fetchSheetText(sheetUrl);
      parseAndProceed(text);
      if (type === "unknown") {
        setError("");
      }
    } catch (e) {
      setError(`${e.message} Paste data is always the reliable fallback.`);
    } finally {
      setLoading(false);
    }
  }

  function buildMappedLeadsFrom(sourceRows, sourceMapping) {
    return sourceRows.map((r) => ({
      name: sourceMapping.name ? r[sourceMapping.name] : "",
      phone: sourceMapping.phone ? r[sourceMapping.phone] : "",
      business: sourceMapping.business ? r[sourceMapping.business] : "",
      vertical: sourceMapping.vertical ? r[sourceMapping.vertical] : "",
      city: sourceMapping.city ? r[sourceMapping.city] : "",
      notes: sourceMapping.notes ? r[sourceMapping.notes] : "",
      status: sourceMapping.status ? r[sourceMapping.status] : "",
      sheetRow: r._sheetRow,
      rowId: `${r[sourceMapping.phone] || ""}-${r[sourceMapping.name] || ""}-${r._sheetRow}`,
    }));
  }

  function buildMappedLeads() {
    return buildMappedLeadsFrom(rows, mapping);
  }

  function previewFilters() {
    const mapped = buildMappedLeads();
    const withPhone = mapped.filter((r) => r.phone && String(r.phone).trim());
    let filtered = withPhone;

    if (filters.skipAlreadyCalled && mapping.status) {
      filtered = filtered.filter((r) => !shouldSkipByStatus(r.status, teamMode));
    }
    if (filters.onlyEmptyStatus && mapping.status) {
      filtered = filtered.filter((r) => !String(r.status || "").trim());
    }

    setFilterPreview({
      total: rows.length,
      withPhone: withPhone.length,
      afterFilters: filtered.length,
      removed: withPhone.length - filtered.length,
    });
    return filtered;
  }

  function buildQueue() {
    const built = previewFilters();
    if (!built.length) {
      setError("No leads left after filters. Loosen your filter settings or check the phone column.");
      return;
    }
    setQueue(built);
    setIndex(0);
    setLog([]);
    setCallNote("");
    setCallbackAt("");
    setPendingOutcome(null);
    setStage("queue");
    setError("");
  }

  async function advance(result, extra = {}) {
    if (!current) return;

    const outcome = OUTCOME_BY_ID[result];
    if (outcome?.needsCallback && !extra.callbackAt && !callbackAt) {
      setPendingOutcome(result);
      setError("Pick a callback date and time first.");
      return;
    }

    const note = callNote.trim();
    const entry = {
      name: current.name,
      phone: current.phone,
      business: current.business,
      sheetNotes: current.notes,
      sheetRow: current.sheetRow,
      result,
      callNote: note,
      callbackAt: extra.callbackAt || callbackAt || "",
      recordedAt: new Date().toISOString(),
    };

    if (teamMode && current.sheetRow) {
      setSyncStatus("Saving to sheet…");
      try {
        await writeStatusToSheet({
          row: current.sheetRow,
          result,
          calledBy: callerName,
          note,
        });
        setSyncStatus("Saved to team sheet");
      } catch (e) {
        setError(`Couldn't update the sheet: ${e.message}`);
        setSyncStatus("");
        return;
      }
    }

    const nextLog = [...log, entry];
    setLog(nextLog);

    if (result === "callback" && entry.callbackAt) {
      setCallbacks((prev) => [
        ...prev,
        {
          ...current,
          callNote: entry.callNote,
          callbackAt: entry.callbackAt,
          recordedAt: entry.recordedAt,
        },
      ]);
    }

    setCallNote("");
    setCallbackAt("");
    setPendingOutcome(null);
    setDragX(0);
    setError("");

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
    if (dragX > 90) advance("interested");
    else if (dragX < -90) advance("skipped");
    else setDragX(0);
  }

  const rotation = Math.max(-12, Math.min(12, dragX / 10));

  function searchLead(lead = current) {
    if (!lead) return;
    const q = encodeURIComponent(`${lead.business || lead.name}`.trim());
    window.open(`https://www.google.com/search?q=${q}`, "_blank");
  }

  function resumeSaved() {
    if (savedSession) applySession(savedSession);
  }

  const btnPrimary =
    "w-full font-medium rounded-xl py-3 transition-colors disabled:opacity-40";
  const btnPrimaryStyle = { background: theme.accent, color: "#fff" };
  const btnPrimaryHover = { background: theme.accentHover };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center p-5 font-sans"
      style={{ background: theme.bg, color: theme.text }}
    >
      <style>{`.digit-label { letter-spacing: 0.14em; }`}</style>

      {!authChecked && (
        <div className="w-full max-w-sm text-center">
          <p className="text-sm" style={{ color: theme.textMuted }}>
            Checking access…
          </p>
        </div>
      )}

      {authChecked && stage === "locked" && <PasscodeGate onUnlock={handleUnlock} />}

      {authChecked && stage === "caller" && (
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: theme.accent }}
            >
              <User size={20} color="#fff" />
            </div>
            <h1 className="text-2xl font-semibold mb-1">Who&apos;s calling?</h1>
            <p className="text-sm" style={{ color: theme.textMuted }}>
              Your name is saved on this device and written to the sheet as Called By.
            </p>
          </div>
          <input
            value={callerInput}
            onChange={(e) => setCallerInput(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl px-4 py-3 mb-3 text-sm border outline-none"
            style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
          />
          {error && <p className="text-xs mb-3" style={{ color: theme.danger }}>{error}</p>}
          <button
            onClick={handleCallerSubmit}
            className="w-full rounded-xl py-3 font-medium"
            style={{ background: theme.accent, color: "#fff" }}
          >
            Continue
          </button>
        </div>
      )}

      {authChecked && stage === "connect" && (
        <div className="w-full max-w-sm">
          {showInstall && <InstallBanner onDismiss={() => setShowInstall(false)} />}

          <div className="mb-8 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: theme.accent }}
            >
              <Phone size={20} color="#fff" />
            </div>
            <h1 className="text-2xl font-semibold mb-1">Call Queue</h1>
            <p className="text-sm" style={{ color: theme.textMuted }}>
              {teamMode
                ? "Shared team queue — live sheet sync, no duplicate calls."
                : "Load your sheet. One lead at a time — track outcomes, notes, and callbacks."}
            </p>
            {teamMode && callerName && (
              <p className="text-xs mt-2" style={{ color: theme.textDim }}>
                Calling as {callerName}
              </p>
            )}
          </div>

          {savedSession && (
            <div
              className="mb-4 rounded-xl border p-4"
              style={{ background: theme.surfaceRaised, borderColor: theme.border }}
            >
              <p className="text-sm font-medium mb-1">Resume last queue</p>
              <p className="text-xs mb-3" style={{ color: theme.textMuted }}>
                {savedSession.queue?.length
                  ? `${Math.min(savedSession.index || 0, savedSession.queue.length)} of ${savedSession.queue.length} processed`
                  : "Saved session"}{" "}
                · saved {formatSavedAt(savedSession.savedAt)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={resumeSaved}
                  className="flex-1 text-sm font-medium rounded-lg py-2"
                  style={{ background: theme.accent, color: "#fff" }}
                >
                  Resume
                </button>
                <button
                  onClick={() => {
                    clearSession();
                    setSavedSession(null);
                  }}
                  className="flex-1 text-sm rounded-lg py-2 border"
                  style={{ borderColor: theme.border, color: theme.textMuted }}
                >
                  Start fresh
                </button>
              </div>
            </div>
          )}

          {teamMode ? (
            <>
              <button
                onClick={handleLoadTeamSheet}
                disabled={loading}
                className={`${btnPrimary} disabled:opacity-50 mb-3`}
                style={btnPrimaryStyle}
              >
                {loading ? "Loading team sheet…" : "Load team sheet"}
              </button>
              <p className="text-xs mb-4 leading-relaxed text-center" style={{ color: theme.textDim }}>
                Pulls live leads from your shared sheet and skips rows already marked with a status.
              </p>
              {!showFallback ? (
                <button
                  onClick={() => setShowFallback(true)}
                  className="w-full text-xs py-2"
                  style={{ color: theme.textMuted }}
                >
                  Manual fallback (paste / custom URL)
                </button>
              ) : (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: theme.border }}>
                  <div
                    className="flex gap-1 rounded-lg p-1 mb-4 border"
                    style={{ background: theme.surface, borderColor: theme.border }}
                  >
                    {["paste", "url"].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setInputMode(mode)}
                        className="flex-1 text-xs font-medium rounded-md py-2 transition-colors"
                        style={
                          inputMode === mode
                            ? { background: theme.accent, color: "#fff" }
                            : { color: theme.textMuted }
                        }
                      >
                        {mode === "paste" ? "Paste data" : "Sheet link"}
                      </button>
                    ))}
                  </div>
                  {inputMode === "paste" ? (
                    <>
                      <textarea
                        className="w-full h-28 rounded-xl px-3 py-3 mb-2 text-xs font-mono outline-none resize-none border"
                        style={{
                          background: theme.surface,
                          borderColor: theme.border,
                          color: theme.text,
                        }}
                        placeholder="Paste CSV fallback…"
                        value={pastedCsv}
                        onChange={(e) => setPastedCsv(e.target.value)}
                      />
                      <button onClick={handleLoadPaste} className={btnPrimary} style={btnPrimaryStyle}>
                        Load pasted data
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        className="w-full rounded-xl px-3 py-3 mb-2 text-sm border outline-none"
                        style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
                        placeholder="Custom sheet URL"
                        value={sheetUrl}
                        onChange={(e) => setSheetUrl(e.target.value)}
                      />
                      <button
                        onClick={handleLoadUrl}
                        disabled={loading}
                        className={`${btnPrimary} disabled:opacity-50`}
                        style={btnPrimaryStyle}
                      >
                        Load custom sheet
                      </button>
                    </>
                  )}
                </div>
              )}
              {error && <p className="text-xs mt-4" style={{ color: theme.danger }}>{error}</p>}
            </>
          ) : (
            <>
          <div
            className="flex gap-1 rounded-lg p-1 mb-4 border"
            style={{ background: theme.surface, borderColor: theme.border }}
          >
            {["paste", "url"].map((mode) => (
              <button
                key={mode}
                onClick={() => setInputMode(mode)}
                className="flex-1 text-xs font-medium rounded-md py-2 transition-colors"
                style={
                  inputMode === mode
                    ? { background: theme.accent, color: "#fff" }
                    : { color: theme.textMuted }
                }
              >
                {mode === "paste" ? "Paste data" : "Sheet link"}
              </button>
            ))}
          </div>

          {inputMode === "paste" && (
            <>
              <label className="block text-xs uppercase digit-label mb-2" style={{ color: theme.textMuted }}>
                Your sheet data
              </label>
              <textarea
                className="w-full h-36 rounded-xl px-3 py-3 mb-2 text-xs font-mono outline-none resize-none border"
                style={{
                  background: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                }}
                placeholder="Name, Phone, Business, Status, Notes..."
                value={pastedCsv}
                onChange={(e) => setPastedCsv(e.target.value)}
              />
              <p className="text-xs mb-4 leading-relaxed" style={{ color: theme.textDim }}>
                In Sheets: select your data (Cmd/Ctrl+A), copy, paste here with headers.
              </p>
              {error && <p className="text-xs mb-4" style={{ color: theme.danger }}>{error}</p>}
              <button
                onClick={handleLoadPaste}
                className={btnPrimary}
                style={btnPrimaryStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = theme.accentHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = theme.accent)}
              >
                Load data
              </button>
            </>
          )}

          {inputMode === "url" && (
            <>
              <label className="block text-xs uppercase digit-label mb-2" style={{ color: theme.textMuted }}>
                Google Sheet link
              </label>
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-3 mb-2 border"
                style={{ background: theme.surface, borderColor: theme.border }}
              >
                <Link2 size={16} style={{ color: theme.textMuted }} className="shrink-0" />
                <input
                  className="bg-transparent outline-none text-sm w-full"
                  style={{ color: theme.text }}
                  placeholder="Paste share or published CSV URL"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                />
              </div>
              <p className="text-xs mb-4 leading-relaxed" style={{ color: theme.textDim }}>
                Set sharing to Anyone with the link — Viewer. Works from a deployed URL; paste is the fallback.
              </p>
              {error && <p className="text-xs mb-4" style={{ color: theme.danger }}>{error}</p>}
              <button
                onClick={handleLoadUrl}
                disabled={loading}
                className={`${btnPrimary} disabled:opacity-50`}
                style={btnPrimaryStyle}
              >
                {loading ? "Connecting…" : "Load sheet"}
              </button>
            </>
          )}
            </>
          )}
        </div>
      )}

      {stage === "map" && (
        <div className="w-full max-w-sm">
          <h2 className="text-lg font-semibold mb-1">Match your columns</h2>
          <p className="text-xs mb-6" style={{ color: theme.textMuted }}>
            {rows.length} rows found. Map columns, then set filters.
          </p>

          {["name", "phone", "vertical", "city", "status", "notes"].map((key) => (
            <div key={key} className="mb-4">
              <label className="block text-xs uppercase digit-label mb-1.5" style={{ color: theme.textMuted }}>
                {key}{" "}
                {key === "phone" && <span style={{ color: theme.accent }}>(required)</span>}
              </label>
              <select
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none border"
                style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
                value={mapping[key]}
                onChange={(e) => {
                  setMapping((m) => ({ ...m, [key]: e.target.value }));
                  setFilterPreview(null);
                }}
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

          <div
            className="rounded-xl border p-4 mb-4"
            style={{ background: theme.surfaceRaised, borderColor: theme.border }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Filter size={14} style={{ color: theme.accent }} />
              <p className="text-sm font-medium">Queue filters</p>
            </div>

            <label className="flex items-start gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.skipAlreadyCalled}
                disabled={!mapping.status}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, skipAlreadyCalled: e.target.checked }));
                  setFilterPreview(null);
                }}
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>
                Skip rows already marked called in status column
                {!mapping.status && " (pick a status column first)"}
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.onlyEmptyStatus}
                disabled={!mapping.status}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, onlyEmptyStatus: e.target.checked }));
                  setFilterPreview(null);
                }}
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>
                Only include rows with empty status
              </span>
            </label>

            {filterPreview && (
              <p className="text-xs mt-3 pt-3 border-t" style={{ color: theme.textMuted, borderColor: theme.border }}>
                {filterPreview.afterFilters} leads ready
                {filterPreview.removed > 0 && ` (${filterPreview.removed} filtered out)`}
              </p>
            )}
          </div>

          {error && <p className="text-xs mb-4" style={{ color: theme.danger }}>{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => {
                previewFilters();
              }}
              disabled={!mapping.phone}
              className="flex-1 rounded-xl py-3 text-sm border"
              style={{ borderColor: theme.border, color: theme.textMuted }}
            >
              Preview
            </button>
            <button
              onClick={buildQueue}
              disabled={!mapping.phone}
              className="flex-[2] rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-1"
              style={btnPrimaryStyle}
            >
              Start dialing <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {stage === "queue" && current && (
        <div className="w-full max-w-sm flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-4 px-1">
            <Odometer value={index + 1} total={queue.length} />
            <div className="flex items-center gap-3">
              {teamMode && (
                <button
                  onClick={handleRefreshTeamSheet}
                  disabled={loading}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border disabled:opacity-50"
                  style={{ borderColor: theme.border, color: theme.textMuted }}
                  title="Refresh from team sheet"
                >
                  <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                </button>
              )}
              {(dueCallbacks.length > 0 || callbacks.length > 0) && (
                <button
                  onClick={() => setStage("callbacks")}
                  className="relative flex items-center gap-1 text-xs px-2 py-1 rounded-lg border"
                  style={{ borderColor: theme.border, color: theme.textMuted }}
                >
                  <Bell size={13} />
                  {dueCallbacks.length > 0 && (
                    <span
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold"
                      style={{ background: theme.danger, color: "#fff" }}
                    >
                      {dueCallbacks.length}
                    </span>
                  )}
                </button>
              )}
              <span className="text-xs" style={{ color: theme.textMuted }}>
                {remaining} left
              </span>
            </div>
          </div>

          {syncStatus && (
            <p className="w-full text-xs mb-3 px-1" style={{ color: theme.info }}>
              {syncStatus}
            </p>
          )}

          <div
            className="relative w-full h-64 mb-4 select-none"
            style={{ touchAction: "pan-y" }}
            onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
            onTouchMove={(e) => onDragMove(e.touches[0].clientX)}
            onTouchEnd={onDragEnd}
            onMouseDown={(e) => onDragStart(e.clientX)}
            onMouseMove={(e) => dragging && onDragMove(e.clientX)}
            onMouseUp={onDragEnd}
            onMouseLeave={() => dragging && onDragEnd()}
          >
            {queue[index + 1] && (
              <div
                className="absolute inset-0 rounded-2xl translate-y-2 scale-[0.96] opacity-60 border"
                style={{ background: theme.surface, borderColor: theme.borderMuted }}
              />
            )}

            <div
              className="absolute inset-0 rounded-2xl p-5 flex flex-col justify-between shadow-xl cursor-grab active:cursor-grabbing border"
              style={{
                background: theme.surfaceRaised,
                borderColor: theme.border,
                transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
                transition: dragging ? "none" : "transform 0.25s ease",
              }}
            >
              <div
                className={`absolute top-4 right-5 text-xs font-semibold digit-label transition-opacity ${
                  dragX > 40 ? "opacity-100 text-emerald-400" : "opacity-0"
                }`}
              >
                INTERESTED
              </div>
              <div
                className={`absolute top-4 left-5 text-xs font-semibold digit-label transition-opacity ${
                  dragX < -40 ? "opacity-100 text-slate-400" : "opacity-0"
                }`}
              >
                SKIP
              </div>

              <div>
                <p className="text-xs uppercase digit-label mb-1" style={{ color: theme.textMuted }}>
                  {current.vertical || current.business || "Lead"}
                </p>
                {current.city && (
                  <p className="text-xs mb-2" style={{ color: theme.textDim }}>
                    {current.city}
                  </p>
                )}
                <h3 className="text-2xl font-semibold leading-tight mb-2">{current.name || "—"}</h3>
                <a
                  href={toTelHref(current.phone) || "#"}
                  className="text-lg font-mono underline decoration-dotted underline-offset-4"
                  style={{ color: theme.accent }}
                >
                  {current.phone}
                </a>
                {current.status && (
                  <p className="text-xs mt-2" style={{ color: theme.textDim }}>
                    Status: {current.status}
                  </p>
                )}
              </div>

              {current.notes && (
                <p className="text-sm leading-relaxed line-clamp-3" style={{ color: theme.textMuted }}>
                  <span className="text-xs uppercase digit-label block mb-1" style={{ color: theme.textDim }}>
                    Pitch
                  </span>
                  {current.notes}
                </p>
              )}
            </div>
          </div>

          <a
            href={toTelHref(current?.phone) || "#"}
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-lg transition-colors"
            style={{ background: theme.accent, color: "#fff" }}
            aria-label="Call"
          >
            <Phone size={24} />
          </a>

          <div className="w-full grid grid-cols-2 gap-2 mb-3">
            {OUTCOMES.map((outcome) => (
              <button
                key={outcome.id}
                onClick={() => {
                  if (outcome.needsCallback) {
                    setPendingOutcome(outcome.id);
                  } else {
                    advance(outcome.id);
                  }
                }}
                className={`text-xs font-medium rounded-lg py-2 px-2 border transition-colors ${outcomeToneClass(outcome.tone)} ${
                  pendingOutcome === outcome.id ? "ring-1 ring-blue-400" : ""
                }`}
              >
                {outcome.label}
              </button>
            ))}
          </div>

          {(pendingOutcome === "callback" || callbackAt) && (
            <div className="w-full mb-3">
              <label className="block text-xs mb-1.5 digit-label" style={{ color: theme.textMuted }}>
                Callback date & time
              </label>
              <input
                type="datetime-local"
                value={callbackAt}
                onChange={(e) => setCallbackAt(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
              />
              <button
                onClick={() => advance("callback")}
                disabled={!callbackAt}
                className="w-full mt-2 rounded-lg py-2 text-sm font-medium disabled:opacity-40"
                style={{ background: theme.accent, color: "#fff" }}
              >
                Save callback & next
              </button>
            </div>
          )}

          <div className="w-full mb-3">
            <label className="block text-xs mb-1.5 digit-label" style={{ color: theme.textMuted }}>
              Call note
            </label>
            <textarea
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              rows={2}
              placeholder="Owner asked to call back Friday…"
              className="w-full rounded-lg px-3 py-2 text-sm border outline-none resize-none"
              style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
            />
          </div>

          {error && <p className="text-xs mb-3 w-full" style={{ color: theme.danger }}>{error}</p>}

          <button
            onClick={() => searchLead()}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: theme.textMuted }}
          >
            <Search size={13} /> Look up {current.business || current.name || "this lead"}
          </button>

          <p className="text-[11px] mt-4 text-center leading-relaxed" style={{ color: theme.textDim }}>
            Swipe right = interested · Swipe left = skip ·{" "}
            {teamMode ? "Outcomes sync to the team sheet" : "Progress saves automatically"}
          </p>
        </div>
      )}

      {stage === "callbacks" && (
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Callbacks</h2>
            <button
              onClick={() => setStage(queue.length && index < queue.length ? "queue" : "done")}
              className="text-xs px-2 py-1 rounded-lg border"
              style={{ borderColor: theme.border, color: theme.textMuted }}
            >
              Back
            </button>
          </div>

          {dueCallbacks.length > 0 && (
            <div className="mb-4">
              <p className="text-xs uppercase digit-label mb-2" style={{ color: theme.danger }}>
                Due now
              </p>
              {dueCallbacks.map((cb, i) => (
                <div
                  key={`due-${i}`}
                  className="rounded-xl border p-3 mb-2"
                  style={{ background: theme.surfaceRaised, borderColor: theme.border }}
                >
                  <p className="font-medium text-sm">{cb.name || cb.phone}</p>
                  <p className="text-xs mb-2" style={{ color: theme.textMuted }}>
                    {new Date(cb.callbackAt).toLocaleString()}
                  </p>
                  {cb.callNote && (
                    <p className="text-xs mb-2" style={{ color: theme.textDim }}>
                      {cb.callNote}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <a
                      href={toTelHref(cb.phone) || "#"}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: theme.accent, color: "#fff" }}
                    >
                      Call
                    </a>
                    <button
                      onClick={() => searchLead(cb)}
                      className="text-xs px-3 py-1.5 rounded-lg border"
                      style={{ borderColor: theme.border, color: theme.textMuted }}
                    >
                      Search
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {upcomingCallbacks.length > 0 && (
            <div>
              <p className="text-xs uppercase digit-label mb-2" style={{ color: theme.textMuted }}>
                Upcoming
              </p>
              {upcomingCallbacks.map((cb, i) => (
                <div
                  key={`up-${i}`}
                  className="rounded-xl border p-3 mb-2 flex items-center justify-between gap-2"
                  style={{ background: theme.surface, borderColor: theme.border }}
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate">{cb.name || cb.phone}</p>
                    <p className="text-xs flex items-center gap-1" style={{ color: theme.textMuted }}>
                      <Clock size={11} />
                      {new Date(cb.callbackAt).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={toTelHref(cb.phone) || "#"}
                    className="text-xs px-2 py-1 rounded-lg shrink-0"
                    style={{ background: theme.accent, color: "#fff" }}
                  >
                    Call
                  </a>
                </div>
              ))}
            </div>
          )}

          {callbacks.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: theme.textMuted }}>
              No callbacks scheduled yet.
            </p>
          )}
        </div>
      )}

      {stage === "done" && (
        <div className="w-full max-w-sm text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: theme.success }}
          >
            <Check size={24} style={{ color: theme.bg }} />
          </div>
          <h2 className="text-xl font-semibold mb-1">Queue cleared</h2>
          <p className="text-sm mb-5" style={{ color: theme.textMuted }}>
            {analytics.processed} processed · {analytics.total} total
          </p>

          <div
            className="rounded-xl border p-4 mb-4 text-left"
            style={{ background: theme.surfaceRaised, borderColor: theme.border }}
          >
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={14} style={{ color: theme.accent }} />
              <p className="text-sm font-medium">Session stats</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["Contact rate", `${analytics.contactRate}%`],
                ["Interested", analytics.interested],
                ["Callbacks", analytics.callbacks],
                ["No answer", analytics.noAnswer],
                ["Voicemail", analytics.voicemail],
                ["Not interested", analytics.notInterested],
                ["Bad numbers", analytics.badNumbers],
                ["Skipped", analytics.skipped],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2 py-1 border-b" style={{ borderColor: theme.borderMuted }}>
                  <span style={{ color: theme.textMuted }}>{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
            {analytics.contacted > 0 && (
              <p className="text-xs mt-3" style={{ color: theme.textDim }}>
                {analytics.interestRate}% of contacted leads showed interest
              </p>
            )}
          </div>

          <div
            className="text-left rounded-xl border p-4 mb-4 max-h-48 overflow-y-auto"
            style={{ background: theme.surface, borderColor: theme.border }}
          >
            {log.map((l, i) => (
              <div
                key={i}
                className="flex items-start justify-between py-1.5 text-sm border-b last:border-0 gap-2"
                style={{ borderColor: theme.borderMuted }}
              >
                <div className="min-w-0">
                  <p className="truncate">{l.name || l.phone}</p>
                  {l.callNote && (
                    <p className="text-xs truncate" style={{ color: theme.textDim }}>
                      {l.callNote}
                    </p>
                  )}
                </div>
                <span className={`text-xs shrink-0 ${outcomeBadgeClass(OUTCOME_BY_ID[l.result]?.tone)}`}>
                  {OUTCOME_BY_ID[l.result]?.label || l.result}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => exportResultsCsv(log)}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3 font-medium"
              style={{ background: theme.accent, color: "#fff" }}
            >
              <Download size={15} /> Export CSV
            </button>

            {callbacks.length > 0 && (
              <button
                onClick={() => setStage("callbacks")}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3 border"
                style={{ borderColor: theme.border, color: theme.textMuted }}
              >
                <Bell size={15} /> View callbacks ({callbacks.length})
              </button>
            )}

            <button
              onClick={resetAll}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3 border"
              style={{ borderColor: theme.border, color: theme.textMuted }}
            >
              <RotateCcw size={15} /> Load another sheet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
