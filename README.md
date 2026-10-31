# ShadowAI Sentinel

**A privacy-first browser extension for reducing accidental sensitive-data exposure in AI prompts.** Built on Chrome/Edge Manifest V3. The project runs its detection rules locally in the browser and stores metadata-only audit events.

> This is a security aid, not a guarantee against data leakage, an enterprise DLP product, a network firewall, or a substitute for organizational policy.

## What it does

### Prompt protection
- Watches prompt submission attempts on supported AI services.
- Scans locally for private-key headers, AWS access key IDs, GitHub tokens, named secrets/passwords, JWT-like tokens, email addresses, possible phone numbers, student/employee IDs, US SSN patterns, and street-address patterns.
- Stops submission when a finding meets the configured severity threshold.
- Offers redaction, keep-blocked, or an explicit one-time override. After redaction, the user reviews and submits the edited prompt manually.
- Optional strict destination mode stops prompts on supported sites that are not in the approved-host list.

### Management console
- Popup for quick protection toggle and seven-day counters.
- Dashboard with recent activity, service/action search, risk filtering, JSON export, CSV export, and local history deletion.
- Settings for enable/disable, strict destination mode, block threshold, retention window, and approved hostnames.
- Local event retention is bounded to 1,000 events and pruned by the configured age limit.

### Privacy model
- Prompt text and matched values are never sent to the extension service worker or stored in the activity history.
- Event records contain only timestamp, hostname, action, risk, and finding count.
- No analytics, remote API, remote font, or third-party service is used.
- Browser storage is local to the current browser profile; it is not encrypted by this extension.

## Supported sites

The current manifest targets ChatGPT, Claude, Gemini, Microsoft Copilot, Perplexity, Poe, Grok, DeepSeek, You.com, Mistral Le Chat, Hugging Face Chat, and Meta AI. Website UI changes can break prompt-field or send-button detection. Review and test each site before relying on it.

## Install in Chrome or Edge

1. Extract the ZIP to a normal folder.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `ShadowAI-Sentinel` folder.
5. Open a supported AI service and reload the page. The ShadowAI Sentinel pill should appear in the lower-right corner.
6. Open the extension popup to change protection state, open the dashboard, or edit policy settings.

After editing source files, use **Reload** on the browser extension page and reload the AI website tab.

## Safe demo

Use only fictional values, for example:

- `student ID: STU-2026-12345`
- `demo.user@example.com`
- `api_key = demo_secret_123456789`
- `AKIAIOSFODNN7EXAMPLE` (synthetic-looking AWS-format test string; do not use a real credential)

Try submitting the prompt. If the configured threshold matches, ShadowAI pauses submission and offers redaction or keeping it blocked. Check the dashboard for metadata-only events.

## Project structure

- `manifest.json` — permissions, site scope, service worker and content-script registration
- `scanner.js` — local pattern rules, severity ranking, masking and redaction
- `content.js` — prompt field discovery, submission interception and on-page warning panel
- `background.js` — settings defaults, event validation, retention and bounded storage
- `popup.html/js/css` — compact browser action popup
- `dashboard.html/js/css` — seven-day metrics, searchable event history and export
- `options.html/js/css` — policy settings and approved-host list
- `tests/scanner.test.cjs` — local scanner regression tests

## Test scanner rules

Requires Node.js; no third-party packages are needed:

```bash
node tests/scanner.test.cjs
```

The tests use fictional strings and verify detection, severity, multi-match scanning, and redaction. They do not prove coverage of every real-world format.

## Known limitations and next steps

- Regex-based scanning can produce false positives and false negatives. It is not semantic or context-aware detection.
- Browser-side interception depends on a website's DOM and event handling. Some sites may submit through custom controls, shadow DOM, or app-specific code that this prototype does not intercept.
- The current scanner is not a full credit-card or arbitrary secret detector; do not assume a clean result means a prompt is safe.
- A one-time override is intentionally available to the user. This extension is designed as a personal safeguard, not tamper-resistant enterprise enforcement.
- For production use, add a reviewed site-adapter test suite, signed releases, security review, extension-store privacy disclosures, and organization-managed policy distribution.


## v3.0 additions

- **Paste-time review:** clipboard text is inspected in supported AI composers before insertion. Suspicious prompt indicators and high/critical secret findings are held for a review card with discard, sanitize, or one-time paste actions.
- **Explainable prompt analysis:** local heuristic rules flag instruction override attempts, secret extraction, stealthy exfiltration, suspicious encoded command markers, potentially destructive command requests, and attempts to disable guardrails. The score is a rule-based signal, not a probability or guarantee.
- **Policy controls:** settings include paste protection, prompt-injection analysis, balanced/strict/research profile selection, strict destination mode, and severity threshold. Dashboard quick controls save locally.
- **Dashboard metrics:** paste review and prompt threat counters appear alongside activity history and exports.

### Limitations

This extension is a browser-side heuristic prototype. It only runs on declared supported domains and is not a system-wide clipboard monitor, network firewall, malware sandbox, or complete semantic classifier. Site DOM changes may affect interception. Test with fictional data and inspect the page behavior after each supported-site update. The `research` profile is a user-selected label; users should still explicitly configure the thresholds and review behavior to suit their use case.


## Version 4.0 — universal submit-time protection

- **No paste-time blocking:** pasting is never intercepted. Scanning happens when the user clicks a send/submit-style control or presses Enter in a supported editable field.
- **Broader website coverage:** the content script is configured for all URLs. This requires broad host access and triggers a stronger browser permission warning. Use only if you trust the extension source.
- **Sensitive-data rules:** adds pattern checks for Indian PAN, Aadhaar-like numbers, IFSC, labeled bank-account numbers, IBAN, UPI IDs and Luhn-valid payment-card numbers, alongside existing credential and PII rules. These are heuristics, not identity validation.
- **Form submit checks:** on non-financial domains, text-like fields in the nearest form are inspected at submission time. Password fields are never read. Recognized financial-service domains are excluded from form scanning to avoid disrupting legitimate login/payment flows; this also means those domains are not protected by this extension's form scanner.
- **Privacy:** prompt/form text and matched values are not sent to the extension service worker or saved in audit logs; only site, action, risk and finding counts are recorded. All scanning runs locally.

### Known limitations

Browser extensions cannot reliably inspect every custom web-app submission path, cross-origin embedded frame, native app, or browser-level clipboard use. Universal host access broadens the extension's access; users should review permissions carefully. Detection can miss obfuscated values or produce false positives. This tool is not a substitute for bank fraud controls, endpoint security, or a DLP product.
