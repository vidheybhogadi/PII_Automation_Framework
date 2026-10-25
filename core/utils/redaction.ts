/**
 * Redaction helpers. Two layers of defence:
 *
 *  1. KEY-BASED: object properties whose name is known to carry sensitive data are replaced entirely
 *     (value, phone, key, signature, password, ...). This is the primary control.
 *  2. PATTERN-BASED: free text (e.g. an error message returned by the server) is scrubbed for anything
 *     that LOOKS like an email, phone number, PEM block, Bearer token or long Base64 blob. A safety net.
 *  3. EXACT: the configured secret values themselves (the Aisle test token, the DB password) are registered
 *     at config load and removed from any text, whatever surrounds them.
 *
 * The logger runs every entry through both layers, so a mistake in one call site does not leak PII.
 */

export const REDACTED = '[REDACTED]';

/** Property names (compared case-insensitively) whose values are always removed. */
const SENSITIVE_KEYS = new Set(
  [
    'value',
    'values',
    'phone',
    'email',
    'name',
    'key',
    'private_key',
    'privatekey',
    'privatekeypem',
    'signature',
    'password',
    'db_password',
    'secret',
    'token',
    'authorization',
    'body',
    'rawbody',
    'data',
    'pem',
    'plaintext',
    'encrypted_value',
    'encrypted_key_material',
    'connectionstring',
  ].map((k) => k.toLowerCase()),
);

/**
 * Exact secret values (token, DB password) registered by the config loader → the placeholder shown instead
 * (e.g. "$AISLE_TEST_TOKEN"). Never exported or logged.
 */
const SECRET_VALUES = new Map<string, string>();

/**
 * Remove this exact value from every scrubbed text from now on. Values shorter than 8 chars are ignored.
 * @param placeholder what to show instead in captured requests (default "[REDACTED_SECRET]").
 */
export function registerSecretValue(value: string, placeholder = '[REDACTED_SECRET]'): void {
  if (value.length >= 8) SECRET_VALUES.set(value, placeholder);
}

/**
 * Replace ONLY registered secrets (the token, the DB password) with their placeholders and leave everything else
 * as is. Used for the request/response capture in reports, where the (synthetic) test data is shown in full but
 * the token must never appear.
 */
export function maskSecretsOnly(text: string): string {
  let out = text;
  for (const [value, placeholder] of SECRET_VALUES) out = out.split(value).join(placeholder);
  return out;
}

/** A JWT-looking value (header.payload.signature, base64url) — e.g. a user auth_token in a login reply. */
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g;
/** Keys whose value is a credential, whatever it looks like (auth_token, access_token, grant_token_…, jwt, token). */
export const TOKEN_KEY_PATTERN = /^(auth_token|access_token|refresh_token|token|jwt|grant_token\w*)$/i;
const TOKEN_KEYS = 'auth_token|access_token|refresh_token|token|jwt|grant_token\\w*';
/** "key": "value" (JSON, any spacing) and key=value (query / form) for the token keys. */
const TOKEN_JSON_PATTERN = new RegExp(`("(?:${TOKEN_KEYS})"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, 'gi');
const TOKEN_FORM_PATTERN = new RegExp(`(\\b(?:${TOKEN_KEYS})=)[^&\\s"']+`, 'gi');

/**
 * Replace credentials that were never registered as secrets — tokens issued INSIDE a reply (login, verify,
 * submit_profile, reset_profile …): every JWT-looking value, and the value of every auth_token / access_token /
 * refresh_token / token / jwt / grant_token* key (JSON or key=value), with [REDACTED]. Used by the exchange
 * recorder for request and response bodies, URLs and headers before anything is written to a report (2026-10-24).
 */
export function maskTokens(text: string): string {
  return text
    .replace(TOKEN_JSON_PATTERN, `$1"${REDACTED}"`)
    .replace(TOKEN_FORM_PATTERN, `$1${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED);
}

/** Any e-mail address that is not on the synthetic @example… test domain (or its sub-domains), in any letter case. */
const FOREIGN_EMAIL_PATTERN =
  /[A-Za-z0-9._%+-]+@(?!(?:[A-Za-z0-9-]+\.)*[Ee][Xx][Aa][Mm][Pp][Ll][Ee]\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Replace every e-mail address that is not a synthetic @example… address with [REDACTED_EMAIL]. Staging replies
 * (discover / concierge lists) carry OTHER members' free text, where people type their own e-mail; the recorder
 * must never copy that into a report (2026-10-25). Synthetic test e-mails stay readable.
 */
export function maskForeignEmails(text: string): string {
  return text.replace(FOREIGN_EMAIL_PATTERN, '[REDACTED_EMAIL]');
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** Dates and date-times (ISO, or "YYYY-MM-DD HH:MM[:SS]") are not PII and must survive phone scrubbing. */
const ISO_DATETIME_PATTERN =
  /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const PEM_PATTERN = /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** 8+ digits, optionally separated by space ( ) . - and an optional leading "+" — phone-like. */
const PHONE_PATTERN = /\+?\d(?:[\s().-]*\d){7,}/g;
/**
 * A bare run of 8–9 digits (no "+", no separators) is a record id — e.g. an Aisle app user id — not a phone number
 * (an Indian mobile has 10 digits): kept, so reports stay readable (2026-10-24). Every 10+ digit run, every "+…"
 * value and every separated number is still masked.
 */
const BARE_SHORT_ID = /^\d{8,9}$/;
const maskPhone = (match: string): string => (BARE_SHORT_ID.test(match) ? match : '[REDACTED_PHONE]');
/** "Bearer <anything>" — an Authorization value, whatever the token looks like. */
const BEARER_PATTERN = /\bBearer\s+(?!\[REDACTED)[^\s"',;}]+/gi;
/** Base64 runs of 40+ chars: 32-byte keys (44 chars) and 64-byte signatures (88 chars). */
const BASE64_BLOB_PATTERN = /[A-Za-z0-9+/]{40,}={0,2}/g;

/**
 * Scrub free text. UUIDs (request/transient/key IDs) and ISO timestamps are protected first because they
 * contain long digit runs that would otherwise be mistaken for phone numbers.
 */
export function scrubText(input: string): string {
  const protectedTokens: string[] = [];
  const protect = (match: string): string => {
    protectedTokens.push(match);
    return `\u0000${protectedTokens.length - 1}\u0000`;
  };

  let text = input;
  for (const value of SECRET_VALUES.keys()) text = text.split(value).join('[REDACTED_SECRET]');
  text = text.replace(BEARER_PATTERN, 'Bearer [REDACTED_TOKEN]');
  text = text.replace(UUID_PATTERN, protect).replace(ISO_DATETIME_PATTERN, protect);
  text = text
    .replace(PEM_PATTERN, '[REDACTED_PEM]')
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(BASE64_BLOB_PATTERN, '[REDACTED_B64]')
    .replace(PHONE_PATTERN, maskPhone);
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => protectedTokens[Number(index)] ?? '');
}

/** Deep-copy a value, removing sensitive properties and scrubbing strings. Handles cycles and Buffers. */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (value instanceof Error) return { name: value.name, message: scrubText(value.message) };
  if (typeof value !== 'object') return `[${typeof value}]`;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = isSensitiveKey(k) ? (v === null || v === undefined ? v : REDACTED) : redact(v, seen);
  }
  return out;
}

/**
 * Mask an identifier for display, keeping enough to correlate: "qa-auto-20260926-ab12-w0-7-email" ->
 * "qa-a…mail". Test identifiers are synthetic, but masking keeps reports tidy and habits safe.
 */
export function maskIdentifier(id: string, keep = 4): string {
  if (id.length <= keep * 2 + 1) return `${id.slice(0, 1)}…`;
  return `${id.slice(0, keep)}…${id.slice(-keep)}`;
}
