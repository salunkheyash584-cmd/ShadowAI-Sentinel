// ShadowAI Sentinel local scanner. Never persist matched text or values.
const RULES = [
  { id: "private-key", label: "Private key", severity: "critical", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ig },
  { id: "aws-key", label: "AWS access key ID", severity: "critical", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: "github-token", label: "GitHub token", severity: "critical", regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { id: "generic-secret", label: "Named secret or password", severity: "high", regex: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|secret|bearer)\s*[:=]\s*["']?[A-Za-z0-9_./+=:-]{8,}/ig },
  { id: "jwt", label: "JWT-like token", severity: "high", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { id: "email", label: "Email address", severity: "medium", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig },
  { id: "phone", label: "Possible phone number", severity: "medium", regex: /(?<!\w)(?:\+?\d{1,3}[ .-]?)?(?:\(?\d{3,5}\)?[ .-]?)\d{3,4}[ .-]?\d{3,4}(?!\w)/g },
  { id: "student-id", label: "Possible student or roll ID", severity: "medium", regex: /\b(?:student\s*(?:id|no\.?|number)|roll\s*(?:no\.?|number)|employee\s*id)\s*[:#-]?\s*[A-Z0-9-]{5,24}\b/ig },
  { id: "ssn", label: "Possible US SSN", severity: "high", regex: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
  { id: "address", label: "Possible street address", severity: "low", regex: /\b\d{1,6}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,4}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b/ig },
  { id: "india-pan", label: "Possible Indian PAN", severity: "high", regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { id: "aadhaar", label: "Possible Aadhaar number", severity: "high", regex: /\b(?:\d{4}[ -]?){2}\d{4}\b/g },
  { id: "iban", label: "Possible IBAN", severity: "high", regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/ig },
  { id: "ifsc", label: "Possible Indian IFSC code", severity: "medium", regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { id: "bank-account", label: "Labeled bank account number", severity: "high", regex: /\b(?:bank\s*)?(?:account|a\/c)\s*(?:number|no\.?|#)?\s*[:=-]\s*\d{8,18}\b/ig },
  { id: "upi-id", label: "Possible UPI ID", severity: "high", regex: /\b[A-Z0-9._-]{2,}@(?!example\b)(?:ybl|ibl|axl|okaxis|okhdfcbank|oksbi|okicici|paytm|apl|upi|indus|fbl|sbi|hdfcbank|icici)\b/ig },
  { id: "payment-card", label: "Possible payment card number", severity: "high", regex: /\b(?:\d[ -]*?){13,19}\b/g }
];
const SEVERITY_ORDER = { clear: 0, low: 1, medium: 2, high: 3, critical: 4 };
function scanText(text) {
  text = String(text ?? "");
  const findings = [];
  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let match, count = 0;
    while ((match = rule.regex.exec(text)) && count < 30) {
      if (rule.id === "payment-card" && !passesLuhn(match[0].replace(/\D/g, ""))) continue;
      findings.push({ id: rule.id, label: rule.label, severity: rule.severity, start: match.index, end: match.index + match[0].length, sample: mask(match[0]) });
      count++;
      if (!match[0].length) rule.regex.lastIndex++;
    }
  }
  findings.sort((a,b) => a.start - b.start || b.end - a.end);
  // Drop overlapping findings so a single token is not redacted multiple times.
  const clean = [];
  for (const f of findings) {
    const prior = clean[clean.length - 1];
    if (prior && f.start < prior.end) {
      if (SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[prior.severity]) clean[clean.length - 1] = f;
    } else clean.push(f);
  }
  const risk = clean.reduce((highest, f) => SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[highest] ? f.severity : highest, "clear");
  return { findings: clean, risk, counts: clean.reduce((acc, f) => (acc[f.severity] = (acc[f.severity] || 0) + 1, acc), {}) };
}
function passesLuhn(digits) {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0, doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (doubleDigit) { n *= 2; if (n > 9) n -= 9; }
    sum += n; doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}
function mask(value) { if (value.length <= 6) return "••••"; return `${value.slice(0, 2)}••••${value.slice(-3)}`; }
function redactText(text, findings) {
  return [...findings].sort((a,b) => b.start - a.start).reduce((value, f) => value.slice(0, f.start) + `[REDACTED ${f.label.toUpperCase()}]` + value.slice(f.end), String(text ?? ""));
}

const PROMPT_RULES = [
  { id: "instruction-override", label: "Instruction override attempt", severity: "high", weight: 3, regex: /\b(ignore|disregard|override|forget)\b.{0,70}\b(previous|prior|above|system|developer|all)\b.{0,35}\b(instruction|rule|prompt|message)s?\b/i },
  { id: "secret-extraction", label: "Secret or hidden-instruction extraction", severity: "high", weight: 3, regex: /\b(reveal|print|exfiltrate|dump|show|extract|disclose)\b.{0,70}\b(secret|password|api.?key|credential|system prompt|hidden instruction|environment variable|token)s?\b/i },
  { id: "stealth-exfiltration", label: "Stealthy data-exfiltration request", severity: "critical", weight: 6, regex: /\b(silently|without (?:telling|asking|notifying)|secretly|covertly)\b.{0,90}\b(upload|send|exfiltrate|transmit|copy|post)\b.{0,90}\b(data|secret|key|credential|environment|file|document)s?\b/i },
  { id: "unsafe-tool-action", label: "Potentially destructive command or action", severity: "high", weight: 3, regex: /\b(run|execute|invoke)\b.{0,70}\b(rm\s+-rf|format\s+[a-z]:|delete all|drop database|curl.{0,60}\|\s*(?:sh|bash)|powershell\s+-enc(?:odedcommand)?)\b/i },
  { id: "encoded-payload", label: "Encoded command marker", severity: "medium", weight: 2, regex: /\b(?:powershell\s+-enc(?:odedcommand)?|base64\s+-d|frombase64string|atob\s*\()\b/i },
  { id: "tool-abuse", label: "Untrusted request to use tools or permissions", severity: "medium", weight: 2, regex: /\b(bypass|disable|turn off)\b.{0,50}\b(safety|security|permission|logging|guardrail|filter)s?\b/i }
];
function analyzePrompt(text) {
  text = String(text ?? "");
  const findings = [];
  let score = 0;
  for (const rule of PROMPT_RULES) {
    rule.regex.lastIndex = 0;
    const match = rule.regex.exec(text);
    if (match) { findings.push({ id: rule.id, label: rule.label, severity: rule.severity, sample: "indicator matched", start: match.index, end: match.index + match[0].length }); score += rule.weight; }
  }
  const risk = score >= 6 ? "critical" : score >= 3 ? "high" : score >= 2 ? "medium" : "clear";
  return { findings, score: Math.min(score, 10), risk, confidence: findings.length >= 2 ? "higher" : findings.length === 1 ? "limited" : "no indicators" };
}

globalThis.ObsidianScanner = { scanText, redactText, analyzePrompt, SEVERITY_ORDER };
