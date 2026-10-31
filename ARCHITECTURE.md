# ShadowAI Sentinel architecture

```text
AI website tab
  ├─ scanner.js (isolated content-script world)
  │    ├─ local regex rules
  │    ├─ severity aggregation
  │    └─ offset-based redaction
  └─ content.js
       ├─ finds visible prompt fields
       ├─ intercepts supported submit interactions
       ├─ displays review / redact / block / override controls
       └─ sends metadata-only event to service worker

Manifest V3 service worker (background.js)
  ├─ validates and bounds event metadata
  ├─ applies retention and event cap
  └─ stores settings + metadata in chrome.storage.local

Popup ── quick toggle / recent counters / navigation
Options ── block threshold / approved hostnames / retention
Dashboard ── seven-day metrics / filters / CSV + JSON export / clear history
```

## Data flow invariants

1. Prompt text is read by the content script and passed only to the local scanner and redaction logic.
2. The event sent to the service worker contains only `site`, `action`, `risk`, and `findings`.
3. The service worker constructs a fresh allow-listed record; it does not persist arbitrary message properties.
4. The browser storage is local to the browser profile. No remote service is configured.
5. The user remains in control and can override a warning; this is a personal safety control, not tamper-proof policy enforcement.


## V4 coverage and submission policy
The content script is configured for all URL schemes supported by Chrome's `<all_urls>` match. It does not intercept paste events. It scans supported editable text and, on non-financial domains, text-like fields within a form when a send/submit action is attempted. Password fields are excluded. A small domain heuristic excludes recognized financial-service domains to reduce interference with legitimate transactions; this is not a comprehensive or authoritative bank-domain list. The scanner adds format-based detection for several financial identifiers, but does not validate ownership or actual account status.
