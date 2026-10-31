const DEFAULTS = {
  enabled: true,
  strictMode: false,
  blockSeverity: "high",
  approvedHosts: ["chatgpt.com", "claude.ai", "gemini.google.com"],
  customRules: [],
  events: [],
  installVersion: "2.0.0",
  retentionDays: 30
};
const MAX_EVENTS = 1000;
chrome.runtime.onInstalled.addListener(async (details) => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const missing = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => current[key] === undefined));
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  if (details.reason === "install") {
    await recordEvent({ site: "extension", action: "installed", risk: "clear", findings: 0 });
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GUARD_EVENT") { recordEvent(message.event).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true; }
  if (message?.type === "GET_SETTINGS") { chrome.storage.local.get(DEFAULTS).then(sendResponse); return true; }
  if (message?.type === "GET_TAB_INFO") { sendResponse({ url: sender.tab?.url ?? "" }); return false; }
  if (message?.type === "CLEAR_EVENTS") { chrome.storage.local.set({ events: [] }).then(() => sendResponse({ ok: true })); return true; }
});
async function recordEvent(event) {
  const { events = [], retentionDays = 30 } = await chrome.storage.local.get(["events", "retentionDays"]);
  const cutoff = Date.now() - Math.max(1, Number(retentionDays) || 30) * 86400000;
  const safeEvent = {
    id: crypto.randomUUID(), time: Date.now(),
    site: String(event?.site || "unknown").slice(0, 120),
    action: String(event?.action || "checked").slice(0, 40),
    risk: ["clear", "low", "medium", "high", "critical"].includes(event?.risk) ? event.risk : "low",
    findings: Math.max(0, Math.min(Number(event?.findings) || 0, 99))
  };
  const retained = events.filter(e => Number(e.time) >= cutoff);
  await chrome.storage.local.set({ events: [safeEvent, ...retained].slice(0, MAX_EVENTS) });
}
