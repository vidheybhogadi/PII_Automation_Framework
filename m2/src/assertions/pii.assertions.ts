/**
 * M2 assertions: "refused without PII" and a deep PII scan of any reply.
 *
 * Findings and assertion messages carry only WHERE something was found and WHAT kind it is ("$.user.email: email
 * address") — never the value itself.
 */
import { expect } from '@playwright/test';
import type { ApiResponse } from '../../../core/http/api-response';

/**
 * JSON keys that hold personal data or encrypted free text in the Aisle APIs (Dev inventory). A non-empty value
 * under one of them is a finding. `message` is deliberately NOT listed: error replies use it for the error text
 * (e.g. 500 {title, message, is_backend_error}); chat text is covered by the text patterns and `previous_message`.
 */
export const PII_KEYS = [
  'first_name',
  'last_name',
  'full_name',
  'name',
  'email',
  'email_id',
  'mobile_number',
  'mobile',
  'phone',
  'phone_number',
  'contact_number',
  'previous_message',
  'bio',
  'key_id',
  'key_material',
  'ciphertext',
  'encrypted_value',
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
/** An Indian mobile number (6–9 followed by 9 digits) or an M2 test number (10 + 8 digits), optional +91. */
const PHONE = /(?<![\w.+-])(?:\+?91[\s-]?)?(?:[6-9]\d{9}|10\d{8})(?![\w.])/;

export interface PiiFinding {
  /** JSON path ("$.profile.first_name") or "body" for non-JSON text. */
  where: string;
  kind: 'PII field with a value' | 'email address' | 'phone number' | 'known test value';
}

export interface ScanOptions {
  /** Keys allowed to carry a value in this reply (e.g. first_name on the first-name read route). */
  allowKeys?: readonly string[];
  /** Exact synthetic values that must NOT appear (e.g. another test user's name). */
  known?: readonly string[];
}

const hasValue = (v: unknown) =>
  v !== null &&
  v !== undefined &&
  v !== false &&
  !(typeof v === 'string' && v.trim() === '') &&
  !(Array.isArray(v) && v.length === 0) &&
  !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);

/**
 * Static, non-personal text that Aisle puts in every generic error reply (observed on staging 2026-10-23:
 * 500 {title:"Oops!", message:"Something went wrong. Please try again or write to us at <support>@aisle.co.",
 * is_backend_error:true}). Aisle's own support address is not personal data, so only this exact phrase is ignored.
 */
const STATIC_TEXT = [/write to us at [A-Za-z0-9._%+-]+@aisle\.co\b/g];

function scanText(raw: string, where: string, o: ScanOptions, out: PiiFinding[]) {
  const text = STATIC_TEXT.reduce((t, re) => t.replace(re, 'write to us at [support]'), raw);
  if (EMAIL.test(text)) out.push({ where, kind: 'email address' });
  if (PHONE.test(text)) out.push({ where, kind: 'phone number' });
  if (o.known?.some((k) => k.length > 0 && text.includes(k))) out.push({ where, kind: 'known test value' });
}

/** Deep scan of a parsed JSON value. */
export function scanForPii(
  value: unknown,
  o: ScanOptions = {},
  where = '$',
  out: PiiFinding[] = [],
): PiiFinding[] {
  if (typeof value === 'string') scanText(value, where, o, out);
  else if (Array.isArray(value)) value.forEach((v, i) => scanForPii(v, o, `${where}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const path = `${where}.${k}`;
      if (PII_KEYS.includes(k.toLowerCase()) && !o.allowKeys?.includes(k) && hasValue(v))
        out.push({ where: path, kind: 'PII field with a value' });
      scanForPii(v, o, path, out);
    }
  }
  return out;
}

/** Scan a whole reply: JSON deeply, anything else as text. */
export function scanResponse(res: ApiResponse, o: ScanOptions = {}): PiiFinding[] {
  if (res.isJson) return scanForPii(res.json(), o);
  const out: PiiFinding[] = [];
  const text = res.rawText();
  if (text.trim()) scanText(text, 'body', o, out);
  return out;
}

/**
 * Personal-data fields a reply carries although the Dev inventory does not list that field for the API (GATE "no
 * extra PII"). A key counts only when its value LOOKS like that field — an email address under an email key, a
 * phone number under a phone key, a non-empty text under a name key — so flags such as `email: true` or option
 * names (`name`) are not findings. Returns JSON paths only, never values.
 */
const FIELD_KEYS: Record<'NAME' | 'EMAIL' | 'PHONE', { keys: string[]; looksLike: (v: unknown) => boolean }> =
  {
    NAME: {
      keys: ['first_name', 'last_name', 'full_name'],
      looksLike: (v) => typeof v === 'string' && v.trim() !== '',
    },
    EMAIL: {
      keys: ['email', 'email_id', 'personal_email'],
      looksLike: (v) => typeof v === 'string' && EMAIL.test(v),
    },
    PHONE: {
      keys: ['mobile_number', 'mobile', 'phone', 'phone_number', 'contact_number', 'fetch_only_number'],
      looksLike: (v) => (typeof v === 'string' || typeof v === 'number') && PHONE.test(String(v)),
    },
  };

export function unlistedPii(
  value: unknown,
  listed: readonly string[],
  where = '$',
  out: string[] = [],
): string[] {
  if (Array.isArray(value)) value.forEach((v, i) => unlistedPii(v, listed, `${where}[${i}]`, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const path = `${where}.${k}`;
      for (const [field, rule] of Object.entries(FIELD_KEYS))
        if (!listed.includes(field) && rule.keys.includes(k.toLowerCase()) && rule.looksLike(v))
          out.push(`${path} (${field.toLowerCase()})`);
      unlistedPii(v, listed, path, out);
    }
  return out;
}

export const isSuccess = (status: number) => status >= 200 && status < 300;

/**
 * Short, value-free description of a reply for reports and the workbook: "401 {unauthorized_request}",
 * "401 empty text/html", "302 → redirect", "404 text/html (1234 chars)".
 */
export function shapeOf(res: ApiResponse): string {
  const type = (res.header('content-type') ?? '').split(';')[0]!.trim();
  const text = res.rawText();
  if (res.status >= 300 && res.status < 400) return `${res.status} → redirect`;
  if (text.trim() === '') return `${res.status} empty${type ? ` ${type}` : ''}`;
  const body = res.json();
  if (Array.isArray(body)) return `${res.status} [${body.length} items]`;
  if (body && typeof body === 'object') return `${res.status} {${Object.keys(body).join(', ')}}`;
  return `${res.status} ${type || 'text'} (${text.length} chars)`;
}

/** The call must be refused (not 2xx) and the reply must contain no personal data. */
export function expectRefusedWithoutPii(res: ApiResponse, label: string, o: ScanOptions = {}): void {
  expect(isSuccess(res.status), `${label}: ${res.summary()} — expected a refusal (not 2xx)`).toBe(false);
  const findings = scanResponse(res, o);
  expect(findings, `${label}: the refusal must contain no personal data (locations only)`).toEqual([]);
}

/** Exact match with a refusal observed on staging (status + body form). */
export function expectObservedRefusal(
  res: ApiResponse,
  observed: { status: number; body: 'unauthorized_request' | 'empty'; on: string },
  label: string,
): void {
  const why = `${label}: observed on staging ${observed.on}`;
  expect(res.status, `${why} → ${observed.status}; got ${res.summary()}`).toBe(observed.status);
  if (observed.body === 'empty') {
    expect(res.rawText().trim() === '', `${why} → empty body; got ${shapeOf(res)}`).toBe(true);
  } else {
    const body = res.json() as { unauthorized_request?: unknown } | undefined;
    expect(
      body?.unauthorized_request === true,
      `${why} → {unauthorized_request:true}; got ${shapeOf(res)}`,
    ).toBe(true);
  }
}
