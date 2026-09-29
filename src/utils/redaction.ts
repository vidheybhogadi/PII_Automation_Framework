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

/** Exact secret values (token, DB password) registered by the config loader. Never exported or logged. */
const SECRET_VALUES = new Set<string>();

/** Remove this exact value from every scrubbed text from now on. Values shorter than 8 chars are ignored. */
export function registerSecretValue(value: string): void {
  if (value.length >= 8) SECRET_VALUES.add(value);
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
  for (const value of SECRET_VALUES) text = text.split(value).join('[REDACTED_SECRET]');
  text = text.replace(BEARER_PATTERN, 'Bearer [REDACTED_TOKEN]');
  text = text.replace(UUID_PATTERN, protect).replace(ISO_DATETIME_PATTERN, protect);
  text = text
    .replace(PEM_PATTERN, '[REDACTED_PEM]')
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(BASE64_BLOB_PATTERN, '[REDACTED_B64]')
    .replace(PHONE_PATTERN, '[REDACTED_PHONE]');
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
