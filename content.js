(() => {
  const scanner = globalThis.ObsidianScanner;
  if (!scanner) return;
  const host = location.hostname.replace(/^www\./, "");
  let settings = { enabled: true, strictMode: false, approvedHosts: [], blockSeverity: "high", pasteProtection: true, promptFirewall: true, profile: "balanced" };
  let lastBlocked = null;
  let overrideUntil = 0;
  let overrideInput = null;
  let overrideText = "";
  let queued = false;
  let panel;
  let lastTextForRisk = "";

  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (value) => { if (value) settings = value; });

  const style = document.createElement("style");
  style.textContent = `
    #obsidian-guard-pill{position:fixed;z-index:2147483646;right:18px;bottom:18px;background:#07120e;color:#e7fff3;border:1px solid #1b6445;border-radius:999px;padding:8px 12px;font:600 12px system-ui;box-shadow:0 6px 24px #0008;cursor:pointer;display:flex;gap:8px;align-items:center}
    #obsidian-guard-pill i{width:8px;height:8px;border-radius:50%;background:#42e49b;box-shadow:0 0 10px #42e49b}
    #obsidian-guard-card{position:fixed;z-index:2147483647;right:18px;bottom:62px;width:min(360px,calc(100vw - 36px));box-sizing:border-box;background:#08120f;color:#e8fff2;border:1px solid #1c6b49;border-radius:16px;padding:18px;font:13px/1.5 system-ui;box-shadow:0 16px 60px #000a}
    #obsidian-guard-card h3{margin:0 0 5px;font-size:16px;color:#8df4bd} #obsidian-guard-card p{margin:7px 0;color:#b8cfc4}
    #obsidian-guard-card .finding{display:inline-block;margin:5px 4px 4px 0;padding:4px 8px;border:1px solid #315243;border-radius:999px;color:#d9f8e7;font-size:11px}
    #obsidian-guard-card button{border:0;border-radius:9px;padding:9px 11px;margin:9px 6px 0 0;background:#39d98a;color:#04140c;font-weight:700;cursor:pointer}
    #obsidian-guard-card button.secondary{background:#17271f;color:#d8eee2;border:1px solid #355542} #obsidian-guard-card button.danger{background:#552424;color:#ffdede}
    #obsidian-guard-card .close{float:right;background:transparent;color:#a6c2b3;padding:0;margin:0;font-size:18px}
  `;
  (document.head || document.documentElement).appendChild(style);

  const pill = document.createElement("button");
  pill.id = "obsidian-guard-pill";
  pill.innerHTML = "<i></i> SHADOWAI <span>ON</span>";
  pill.title = "Open ShadowAI Sentinel";
  pill.addEventListener("click", () => showCard({ title: "ShadowAI Sentinel", message: settings.enabled ? "Local prompt protection is active on this AI site." : "Prompt protection is paused.", findings: [] }));
  document.documentElement.appendChild(pill);

  function editableFrom(node) {
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el) return null;
    const form = el.closest("form");
    const searchRoot = form || el.closest("[data-testid*=composer], [class*=composer], [class*=Composer], [class*=input], main") || document;
    const candidates = [...searchRoot.querySelectorAll('textarea, input:not([type]), input[type="text"], [contenteditable="true"], [role="textbox"]')];
    return candidates.find((item) => item.offsetParent !== null && getText(item).trim().length > 0) || candidates.find((item) => item.offsetParent !== null) || null;
  }

  function getText(el) { return el?.isContentEditable || el?.getAttribute("role") === "textbox" ? el.innerText || el.textContent || "" : el?.value || ""; }
  function overrideMatches(text) {
    return Date.now() < overrideUntil && String(text || "").trim() === overrideText.trim();
  }
  function armOneTimeOverride(blocked) {
    if (!blocked) return;
    overrideInput = blocked.input;
    overrideText = blocked.text;
    overrideUntil = Date.now() + 2500;
  }
  function findSubmitControl(input) {
    const form = input?.closest("form");
    if (form) return form.querySelector("button[type=submit], input[type=submit], button[aria-label*=send i], button[data-testid*=send i]");
    return [...document.querySelectorAll("button,[role=button]")].find((el) => isSendControl(el));
  }
  function setText(el, value) {
    if (el.isContentEditable || el.getAttribute("role") === "textbox") { el.focus(); document.execCommand("selectAll"); document.execCommand("insertText", false, value); }
    else { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set; setter ? setter.call(el, value) : el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); }
  }

  function audit(text, action) {
    const result = scanner.scanText(text);
    const prompt = settings.promptFirewall === false ? { findings: [], risk: "clear" } : scanner.analyzePrompt(text);
    const risk = scanner.SEVERITY_ORDER[prompt.risk] > scanner.SEVERITY_ORDER[result.risk] ? prompt.risk : result.risk;
    chrome.runtime.sendMessage({ type: "GUARD_EVENT", event: { site: host, action: prompt.findings.length ? "prompt-threat" : action, risk, findings: result.findings.length + prompt.findings.length } });
    return result;
  }

  function isSendControl(el) {
    if (el?.closest("#obsidian-guard-card,#obsidian-guard-pill")) return false;
    const button = el?.closest("button,[role=button],input[type=submit]");
    if (!button) return false;
    const label = `${button.innerText || ""} ${button.getAttribute("aria-label") || ""} ${button.getAttribute("data-testid") || ""}`.toLowerCase();
    return /send|submit|generate|ask|message|go/.test(label) && !/stop|cancel|share/.test(label);
  }

  // V4 deliberately does not inspect or interrupt paste events. Text is evaluated only
  // when the user attempts to submit it, matching the user's preferred workflow.
  function isFinancialSite() {
    return /(^|\.)(bank|banking|paypal|stripe|wise|revolut|paytm|phonepe|gpay|googlepay|razorpay|cashfree|venmo|zelle)(\.|$)/i.test(host) ||
      /(^|\.)(sbi|hdfcbank|icicibank|axisbank|kotak|barclays|chase|wellsfargo|bankofamerica|hsbc|citi|capitalone|natwest|lloydsbank)(\.|$)/i.test(host);
  }
  function textForSubmission(actionTarget, composer) {
    const form = actionTarget?.closest("form") || composer?.closest("form");
    // Never inspect password fields. Avoid interfering with recognized financial-service flows;
    // the site itself must handle its own login/payment forms.
    if (isFinancialSite()) return "";
    if (!form) return getText(composer);
    const pieces = [];
    for (const el of form.querySelectorAll('textarea, input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input[type="url"], [contenteditable="true"], [role="textbox"]')) {
      if (el.disabled || el.offsetParent === null) continue;
      const value = getText(el).trim();
      if (value) pieces.push(value);
    }
    return pieces.join("\n");
  }

  document.addEventListener("click", (event) => {
    if (!settings.enabled || !isSendControl(event.target)) return;
    const input = editableFrom(event.target);
    if (!input) return;
    const text = textForSubmission(event.target, input);
    if (overrideMatches(text)) return;
    if (!text.trim()) return;
    lastTextForRisk = text;
    const promptRisk = settings.promptFirewall === false ? { findings: [], risk: "clear" } : scanner.analyzePrompt(text);
    const result = audit(text, "checked");
    result.promptFindings = promptRisk.findings; result.promptRisk = promptRisk;
    if (shouldBlock(result)) {
      event.preventDefault(); event.stopImmediatePropagation();
      lastBlocked = { input, text, target: event.target?.closest?.("button,[role=button],input[type=submit]"), form: event.target?.closest?.("form"), findings: result.findings, promptFindings: result.promptFindings || [] };
      showFindings(result);
    }
  }, true);

  // Catch native form submissions too (e.g. login/search/checkout buttons whose labels do not say Send).
  document.addEventListener("submit", (event) => {
    if (!settings.enabled || event.target?.closest?.("#obsidian-guard-card")) return;
    const form = event.target;
    const currentText = textForSubmission(form, form.querySelector('textarea, input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input[type="url"], [contenteditable="true"], [role="textbox"]'));
    if (overrideMatches(currentText)) { overrideUntil = 0; return; }
    if (!(form instanceof HTMLFormElement)) return;
    const firstEditable = form.querySelector('textarea, input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input[type="url"], [contenteditable="true"], [role="textbox"]');
    if (!firstEditable || isFinancialSite()) return;
    const text = textForSubmission(form, firstEditable);
    if (!text.trim()) return;
    lastTextForRisk = text;
    const promptRisk = settings.promptFirewall === false ? { findings: [], risk: "clear" } : scanner.analyzePrompt(text);
    const result = audit(text, "checked-submit");
    result.promptFindings = promptRisk.findings; result.promptRisk = promptRisk;
    if (shouldBlock(result)) {
      event.preventDefault(); event.stopImmediatePropagation();
      lastBlocked = { input: firstEditable, text, target: event.submitter || findSubmitControl(firstEditable), form, findings: result.findings, promptFindings: result.promptFindings || [] };
      showFindings(result);
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!settings.enabled || event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const input = editableFrom(event.target);
    if (!input || input !== event.target && !input.contains(event.target)) return;
    const text = textForSubmission(event.target, input);
    if (overrideMatches(text)) return;
    if (!text.trim()) return;
    lastTextForRisk = text;
    const promptRisk = settings.promptFirewall === false ? { findings: [], risk: "clear" } : scanner.analyzePrompt(text);
    const result = audit(text, "checked");
    result.promptFindings = promptRisk.findings; result.promptRisk = promptRisk;
    if (shouldBlock(result)) {
      event.preventDefault(); event.stopImmediatePropagation();
      lastBlocked = { input, text, target: findSubmitControl(input), form: input?.closest("form"), findings: result.findings, promptFindings: result.promptFindings || [] };
      showFindings(result);
    }
  }, true);

  // Keep settings current if the user changes them from the extension popup.
  chrome.storage.onChanged.addListener((changes) => { for (const key of ["enabled", "strictMode", "approvedHosts", "blockSeverity", "pasteProtection", "promptFirewall", "profile"]) if (changes[key]) settings[key] = changes[key].newValue; });

  function shouldBlock(result) {
    if (!settings.enabled) return false;
    const unapproved = !(settings.approvedHosts || []).some((d) => host === d || host.endsWith(`.${d}`));
    if (unapproved && settings.strictMode) return true;
    const profileThreshold = settings.profile === "strict" ? "medium" : settings.profile === "research" ? "critical" : settings.blockSeverity;
    const threshold = scanner.SEVERITY_ORDER[profileThreshold] ?? scanner.SEVERITY_ORDER.high;
    const prompt = settings.promptFirewall === false ? { findings: [], risk: "clear" } : scanner.analyzePrompt(lastTextForRisk || "");
    return result.findings.some((finding) => scanner.SEVERITY_ORDER[finding.severity] >= threshold) || ["high", "critical"].includes(prompt.risk);
  }

  function showFindings(result) {
    const allFindings = [...(result.findings || []), ...(result.promptFindings || [])];
    const chips = allFindings.map((f) => `<span class="finding">${escapeHtml(f.label)} · ${escapeHtml(f.severity)}</span>`).join("");
    const unapproved = !(settings.approvedHosts || []).some((d) => host === d || host.endsWith(`.${d}`));
    const strictBlock = unapproved && settings.strictMode;
    const message = strictBlock
      ? `${host} is not approved. The prompt remains on this page.`
      : result.promptFindings?.length ? `Prompt firewall detected ${result.promptFindings.length} suspicious instruction pattern(s) (risk ${result.promptRisk?.risk || "unknown"}). Review before sending.`
      : "This prompt may expose private information. The scan ran locally; prompt text is not saved.";
    showCard({ title: strictBlock ? "Unapproved AI service" : result.risk === "critical" || result.risk === "high" ? "Sensitive data stopped" : "Review this prompt", message, chips, findings: result.findings, promptFindings: result.promptFindings || [], strictBlock });
  }

  function showCard(data) {
    panel?.remove();
    panel = document.createElement("div"); panel.id = "obsidian-guard-card";
    panel.innerHTML = `<button class="close" aria-label="Close">×</button><h3>${escapeHtml(data.title)}</h3><p>${escapeHtml(data.message)}</p>${data.chips || ""}<div class="actions"></div>`;
    panel.querySelector(".close").onclick = () => panel.remove();
    const actions = panel.querySelector(".actions");
    if (data.findings?.length && lastBlocked && !data.pasteReview) {
      const redact = document.createElement("button"); redact.textContent = "Redact prompt";
      redact.onclick = () => { const newText = scanner.redactText(lastBlocked.text, lastBlocked.findings); setText(lastBlocked.input, newText); chrome.runtime.sendMessage({ type: "GUARD_EVENT", event: { site: host, action: "redacted", risk: scanner.scanText(lastBlocked.text).risk, findings: lastBlocked.findings.length } }); lastBlocked = null; panel.remove(); };
      actions.append(redact);
      const block = document.createElement("button"); block.textContent = "Keep blocked"; block.className = "secondary"; block.onclick = () => { chrome.runtime.sendMessage({ type: "GUARD_EVENT", event: { site: host, action: "blocked", risk: scanner.scanText(lastBlocked.text).risk, findings: lastBlocked.findings.length } }); lastBlocked = null; panel.remove(); };
      actions.append(block);
    }
    if (data.strictBlock) {
      const allow = document.createElement("button"); allow.textContent = "Allow this prompt once"; allow.className = "secondary";
      allow.onclick = () => { const blocked = lastBlocked; armOneTimeOverride(blocked); chrome.runtime.sendMessage({ type: "GUARD_EVENT", event: { site: host, action: "allowed-once", risk: "low", findings: 0 } }); panel.remove(); if (blocked?.target?.isConnected) blocked.target.click(); else if (blocked?.form?.isConnected && typeof blocked.form.requestSubmit === "function") blocked.form.requestSubmit(); };
      actions.append(allow);
    } else if ((data.findings?.length || data.promptFindings?.length) && lastBlocked) {
      const allow = document.createElement("button"); allow.textContent = "Send as-is once"; allow.className = "secondary";
      allow.onclick = () => {
        const blocked = lastBlocked;
        armOneTimeOverride(blocked);
        chrome.runtime.sendMessage({ type: "GUARD_EVENT", event: { site: host, action: "allowed-once", risk: scanner.scanText(blocked.text).risk, findings: (blocked.findings || []).length + (blocked.promptFindings || []).length } });
        panel.remove();
        // Retry the original submission immediately. The short-lived, text-matched override
        // bypasses this exact prompt once across click + form-submit event sequences.
        if (blocked.target?.isConnected) blocked.target.click();
        else if (blocked.form?.isConnected && typeof blocked.form.requestSubmit === "function") blocked.form.requestSubmit();
        else if (blocked.input?.isConnected) {
          blocked.input.focus();
          blocked.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        }
      };
      actions.append(allow);
    }
    const dismiss = document.createElement("button"); dismiss.textContent = "Dismiss"; dismiss.className = "secondary"; dismiss.onclick = () => panel.remove(); actions.append(dismiss);
    document.documentElement.append(panel);
  }

  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])); }
})();
