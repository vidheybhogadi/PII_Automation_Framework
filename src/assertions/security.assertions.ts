/**
 * Security-focused assertions. Comparisons of sensitive values report only lengths and short SHA-256
 * fingerprints, so a failure never prints the plaintext into the report.
 */
import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { ApiResponse } from '../clients/api-response';

/** Short, non-reversible fingerprint for correlating values in failure messages. */
export function fingerprint(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

/** Compare two sensitive strings without ever printing them. */
export function expectSecretEquals(actual: unknown, expected: string, label: string): void {
  const ok = typeof actual === 'string' && actual === expected;
  const actualDesc =
    typeof actual === 'string' ? `len=${actual.length} ${fingerprint(actual)}` : `type=${typeof actual}`;
  expect(
    ok,
    `${label}: value mismatch (values redacted). expected len=${expected.length} ${fingerprint(expected)}, ` +
      `actual ${actualDesc}`,
  ).toBe(true);
}

/** Documented: resolve / free-text create / free-text read responses carry `Cache-Control: no-store`. */
export function expectNoStore(res: ApiResponse): void {
  const header = res.header('cache-control') ?? '';
  const directives = header
    .toLowerCase()
    .split(',')
    .map((d) => d.trim());
  expect(
    directives.includes('no-store'),
    `Expected "Cache-Control: no-store" on ${res.summary()}; got "${header || '(absent)'}"`,
  ).toBe(true);
}

/** Common encodings a plaintext value could appear in if it were stored unencrypted. */
export function plaintextRepresentations(plaintext: string): string[] {
  const bytes = Buffer.from(plaintext, 'utf8');
  return [
    plaintext,
    plaintext.toLowerCase(),
    bytes.toString('hex'),
    bytes.toString('hex').toUpperCase(),
    bytes.toString('base64'),
    bytes.toString('base64url'),
  ].filter((v, i, all) => v.length > 0 && all.indexOf(v) === i);
}

/**
 * BASIC check only: the stored value is not the plaintext and does not contain it in common encodings.
 * This does NOT prove strong encryption — it is combined with key_version metadata and API behaviour.
 */
export function containsPlaintext(stored: Buffer | string, plaintext: string): boolean {
  const haystacks: string[] = Buffer.isBuffer(stored)
    ? [stored.toString('utf8'), stored.toString('latin1'), stored.toString('hex'), stored.toString('base64')]
    : [stored];
  const needles = plaintextRepresentations(plaintext);
  return haystacks.some((hay) => needles.some((needle) => hay.includes(needle)));
}

export function expectNotStoredAsPlaintext(
  stored: Buffer | string | null | undefined,
  plaintext: string,
  label: string,
): void {
  expect(stored !== null && stored !== undefined, `${label}: stored value is null/undefined`).toBe(true);
  const size = Buffer.isBuffer(stored) ? stored.length : String(stored).length;
  expect(size > 0, `${label}: stored value is empty`).toBe(true);
  expect(
    containsPlaintext(stored as Buffer | string, plaintext),
    `${label}: stored representation contains the plaintext (${fingerprint(plaintext)}) — value is not encrypted at rest`,
  ).toBe(false);
}

/**
 * Leak detection over any text sink (log lines, report attachments, response text).
 * Reports only how many secrets leaked and where — not the secrets.
 */
export function expectNoSecretsIn(texts: readonly string[], secrets: readonly string[], label: string): void {
  const leaks: string[] = [];
  secrets
    .filter((s) => s.length >= 4)
    .forEach((secret, index) => {
      const forms = plaintextRepresentations(secret);
      texts.forEach((text, line) => {
        // Case-insensitive too: an upper-cased email or hex string is still a leak.
        const lower = text.toLowerCase();
        if (forms.some((form) => text.includes(form) || lower.includes(form.toLowerCase()))) {
          leaks.push(`secret#${index} in entry#${line}`);
        }
      });
    });
  expect(leaks, `${label}: sensitive values found (${leaks.length})`).toEqual([]);
}

/** A response (typically an error) must not echo back submitted sensitive input. */
export function expectResponseDoesNotEcho(res: ApiResponse, secret: string): void {
  expect(
    res.rawText().includes(secret),
    `${res.summary()} echoes submitted sensitive input (${fingerprint(secret)}) in its body`,
  ).toBe(false);
}
