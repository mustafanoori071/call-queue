const STORAGE_KEY = "call-queue-session-v1";

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...session, version: 1, savedAt: new Date().toISOString() })
    );
  } catch {
    // quota or private mode — ignore
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function formatSavedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}
