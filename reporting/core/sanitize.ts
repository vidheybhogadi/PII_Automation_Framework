/**
 * Central report sanitizer — the report must never become a PII leak.
 *
 * Strategy (defence in depth):
 *   1. ALLOW-LIST: the collector copies only known-safe fields (endpoint, status, duration, request ID…).
 *      Request/response bodies, headers, signatures and keys are never read into report data.
 *   2. PATTERN SCRUB: every free-text string (titles, error messages, steps, annotations) passes through
 *      scrubText (emails, phones, PEM, Base64 blobs) plus report-specific patterns below.
 *   3. RENDER-TIME: the dashboard runs the same sanitizer again before displaying free text.
 *
 * Limitation (documented): arbitrary personal NAMES cannot be detected by pattern. The framework never
 * prints values (assertions use fingerprints), which is the primary control for names.
 *
 * Browser-safe: scrubText is a pure regex function.
 */
import { scrubText } from '../../src/utils/redaction';

const EXTRA_PATTERNS: [RegExp, string][] = [
  // Authorization headers / bearer tokens / cookies
  [/\b(authorization|proxy-authorization)\s*[:=]\s*[^\s,;]+(\s+[^\s,;]+)?/gi, '$1: [REDACTED_AUTH]'],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED_TOKEN]'],
  [/\b(set-cookie|cookie)\s*[:=]\s*[^\n]+/gi, '$1: [REDACTED_COOKIE]'],
  // JWTs
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '[REDACTED_JWT]'],
  // key=value secrets
  [
    /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|private[_-]?key|db_password|client[_-]?secret)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    '$1=[REDACTED]',
  ],
  // Connection strings with credentials
  [/\b([a-z][a-z0-9+.-]*):\/\/[^\s/:@]+:[^\s/@]+@/gi, '$1://[REDACTED_CREDENTIALS]@'],
  // X-PII-Signature header values
  [/(x-pii-signature\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED_SIGNATURE]'],
  // Long hex blobs (hashes/ciphertext/keys) — 48+ hex chars
  [/\b[0-9a-f]{48,}\b/gi, '[REDACTED_HEX]'],
];

/** Scrub one free-text string. Idempotent. */
export function sanitizeText(input: string | null | undefined, maxLength = 4000): string {
  if (input === null || input === undefined) return '';
  // Strip ANSI escape codes (Playwright error messages are coloured).
  // eslint-disable-next-line no-control-regex
  let text = String(input).replace(/\u001b\[[0-9;]*m/g, '');
  for (const [pattern, replacement] of EXTRA_PATTERNS) text = text.replace(pattern, replacement);
  text = scrubText(text);
  return text.length > maxLength ? `${text.slice(0, maxLength)}… [truncated]` : text;
}

/** Mask a service URL: keep scheme and a hint of the host. */
export function maskUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const hint = host.length <= 6 ? host : `${host.slice(0, 4)}•••${host.slice(-4)}`;
    return `${parsed.protocol}//${hint}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch {
    return '[REDACTED_URL]';
  }
}

/** Display form of a correlation ID: 8…4 (full value available via copy). */
export function maskRequestId(id: string | undefined): string {
  if (!id) return '—';
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

/** Strings that must never appear anywhere in a rendered report (used by tests and the self-check). */
export const FORBIDDEN_REPORT_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // emails, except the synthetic @example… test domain and its sub-domains, in any letter case (normalization and
  // EMAIL format/length tests send mixed case and sub-domains such as mail.example.test)
  /[A-Za-z0-9._%+-]+@(?!(?:[A-Za-z0-9-]+\.)*[Ee][Xx][Aa][Mm][Pp][Ll][Ee]\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /[A-Za-z0-9+/]{86}==/, // Ed25519 signature shape
];
