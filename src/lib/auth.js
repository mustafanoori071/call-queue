const UNLOCK_KEY = "call-queue-unlocked";
const CALLER_KEY = "call-queue-caller-name";

export function isUnlocked() {
  return sessionStorage.getItem(UNLOCK_KEY) === "1";
}

export function setUnlocked() {
  sessionStorage.setItem(UNLOCK_KEY, "1");
}

export function clearUnlock() {
  sessionStorage.removeItem(UNLOCK_KEY);
}

export function getCallerName() {
  return localStorage.getItem(CALLER_KEY) || "";
}

export function setCallerName(name) {
  const trimmed = String(name || "").trim();
  if (trimmed) localStorage.setItem(CALLER_KEY, trimmed);
  else localStorage.removeItem(CALLER_KEY);
  return trimmed;
}

export async function checkPasscodeRequired() {
  const res = await fetch("/api/check-passcode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Could not verify access");
  const data = await res.json();
  return data.required === true;
}

export async function submitPasscode(code) {
  const res = await fetch("/api/check-passcode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error("Could not verify passcode");
  const data = await res.json();
  if (!data.required || data.ok) {
    setUnlocked();
    return true;
  }
  return false;
}
