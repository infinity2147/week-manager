import { state, saveState } from "./store.js";

const SETTINGS_KEY = "anant-week-manager-sync";

function settings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeSettings(next) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

export function workerURL() {
  return String(settings().workerUrl || "").replace(/\/+$/, "");
}

export function passphrase() {
  return String(settings().passphrase || "");
}

export function isConfigured() {
  return Boolean(workerURL() && passphrase());
}

export function saveSettings({ workerUrl, passphrase: secret }) {
  writeSettings({ workerUrl: String(workerUrl || "").trim(), passphrase: String(secret || "").trim() });
}

export function forgetSettings() {
  localStorage.removeItem(SETTINGS_KEY);
}

export function queued() {
  return Array.isArray(state.pendingOps) ? state.pendingOps : [];
}

export function queueCount() {
  return queued().length;
}

/** Queues an operation and tries to publish. The edit is already applied locally. */
export async function publish(operations) {
  const pending = [...queued(), ...operations];
  state.pendingOps = pending;
  saveState({ render: false });
  return flush();
}

/**
 * Sends the whole queue. On success the queue clears and the caller gets the
 * fresh markdown. On failure the queue survives so nothing is silently lost.
 */
export async function flush() {
  const pending = queued();
  if (!pending.length) return { ok: true, pending: 0 };
  if (!isConfigured()) return { ok: false, pending: pending.length, reason: "not-configured" };

  try {
    const response = await fetch(`${workerURL()}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${passphrase()}` },
      body: JSON.stringify({ ops: pending }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, pending: pending.length, reason: response.status === 401 ? "unauthorized" : body.error || `error ${response.status}` };
    }
    state.pendingOps = [];
    saveState({ render: false });
    return { ok: true, pending: 0, markdown: body.markdown, rejected: body.rejected || [] };
  } catch (error) {
    return { ok: false, pending: pending.length, reason: error.message };
  }
}

/** Reads the plan from the Worker so a Telegram change shows up without waiting for a Pages deploy. */
export async function fetchManagerMarkdown() {
  const base = workerURL();
  if (base) {
    try {
      const response = await fetch(`${base}/manager`, { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        if (body.markdown) return body.markdown;
      }
    } catch {
      // fall through to the published copy
    }
  }
  const fallback = await fetch("./MANAGER.md", { cache: "no-store" });
  if (!fallback.ok) throw new Error(`MANAGER.md returned ${fallback.status}`);
  return fallback.text();
}
