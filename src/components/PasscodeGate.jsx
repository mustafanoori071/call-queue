import React, { useState } from "react";
import { Lock } from "lucide-react";
import { theme } from "../lib/theme";
import { submitPasscode } from "../lib/auth";

export default function PasscodeGate({ onUnlock }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await submitPasscode(code.trim());
      if (ok) onUnlock();
      else setError("Wrong code. Try again.");
    } catch {
      setError("Could not verify passcode. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm text-center">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: theme.accent }}
      >
        <Lock size={20} color="#fff" />
      </div>
      <h1 className="text-2xl font-semibold mb-1">Team access</h1>
      <p className="text-sm mb-6" style={{ color: theme.textMuted }}>
        Enter your team passcode to open the call queue.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Team passcode"
          autoComplete="off"
          className="w-full rounded-xl px-4 py-3 mb-3 text-sm border outline-none"
          style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
        />
        {error && (
          <p className="text-xs mb-3" style={{ color: theme.danger }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full rounded-xl py-3 font-medium disabled:opacity-50"
          style={{ background: theme.accent, color: "#fff" }}
        >
          {loading ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
