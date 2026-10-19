/** UNIT — redaction and the centralized logger. */
import { expect, test } from '@playwright/test';
import { Logger } from '../../src/utils/logger';
import { REDACTED, maskIdentifier, redact, scrubText } from '../../src/utils/redaction';

const EMAIL = 'Jane.Sample@corp.example';
const PHONE = '+91 98765 43210';
const KEY_B64 = 'odNqEN9fHP8rQw8UnpGgM9x74pVh5RCEb65o9UkwJxE=';
const REQUEST_ID = '5e136a0b-2c1d-4f3e-9a8b-7c6d5e4f3a2b';
const TRANSIENT_ID = 'bb1866c4-1cb2-4a80-9254-4d0684198554';

/** A clearly fake PEM-shaped block (not a key) — checks that any PEM text is scrubbed. */
const FAKE_PEM =
  '-----BEGIN PRIVATE KEY-----\nTk9UX0FfUkVBTF9LRVlfVU5JVF9URVNUX09OTFk=\n-----END PRIVATE KEY-----';

test.describe('UNIT redaction & logger', () => {
  test('UT-RED-001 The scrubber removes emails, phones, private keys and Base64 keys from text', () => {
    const out = scrubText(`user ${EMAIL} phone ${PHONE} digits 919876543210 key ${KEY_B64} ${FAKE_PEM}`);
    for (const secret of [EMAIL, PHONE, '919876543210', KEY_B64, 'MC4CAQAw'])
      expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTED_EMAIL]');
    expect(out).toContain('[REDACTED_PHONE]');
    expect(out).toContain('[REDACTED_PEM]');
    expect(out).toContain('[REDACTED_B64]');
  });

  test('UT-RED-002 The scrubber keeps request IDs and timestamps (needed to trace logs)', () => {
    const text = `requestId=${REQUEST_ID} transient=${TRANSIENT_ID} at 2026-09-25T10:05:00Z / 2026-09-25T10:05:00.123+00:00 / Local run 2026-09-26 10:00 UTC / 2026-09-26`;
    expect(scrubText(text)).toBe(text);
  });

  test('UT-RED-002b Only real calendar dates are kept; numbers that merely look like dates are scrubbed', () => {
    expect(scrubText('ran at 2026-09-26 10:00 UTC')).toBe('ran at 2026-09-26 10:00 UTC');
    // month 56 / day 78 is not a date → treated as a phone-like digit run
    expect(scrubText('call 1234-56-78')).toBe('call [REDACTED_PHONE]');
    expect(scrubText('call 9876-13-45 now')).toContain('[REDACTED_PHONE]');
  });

  test('UT-RED-003 Sensitive fields are hidden at any depth, while safe details are kept', () => {
    const out = redact({
      endpoint: 'writePii',
      status: 201,
      headers: { Authorization: 'Bearer unit-fake-token', 'X-Request-Id': REQUEST_ID },
      body: { value: EMAIL },
      nested: [{ key: KEY_B64, key_id: TRANSIENT_ID, phone: PHONE }],
      buf: Buffer.from('secret'),
    }) as Record<string, unknown>;
    expect(out).toEqual({
      endpoint: 'writePii',
      status: 201,
      headers: { Authorization: REDACTED, 'X-Request-Id': REQUEST_ID },
      body: REDACTED,
      nested: [{ key: REDACTED, key_id: TRANSIENT_ID, phone: REDACTED }],
      buf: '[Buffer 6 bytes]',
    });
  });

  test('UT-RED-004 Hiding sensitive fields works for circular objects and error objects', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    expect(redact(a)).toEqual({ name: REDACTED, self: '[Circular]' });
    expect(redact(new Error(`bad ${EMAIL}`))).toEqual({ name: 'Error', message: 'bad [REDACTED_EMAIL]' });
  });

  test('UT-RED-005 The logger stores only scrubbed lines and respects the log level', () => {
    const logger = new Logger({ level: 'info', context: { test: 'UT' } });
    logger.debug('hidden');
    logger.info(`call for ${EMAIL}`, { requestId: REQUEST_ID, value: EMAIL, signature: 'abc', status: 200 });
    logger.child({ caller: 'primary' }).warn('retry', { attempt: 1 });
    const lines = logger.lines();
    expect(lines).toHaveLength(2);
    const joined = lines.join('\n');
    expect(joined).not.toContain(EMAIL);
    expect(joined).not.toContain('"abc"');
    expect(joined).toContain(REQUEST_ID);
    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(first).toMatchObject({
      level: 'info',
      test: 'UT',
      status: 200,
      value: REDACTED,
      signature: REDACTED,
    });
    expect(JSON.parse(lines[1]!)).toMatchObject({ caller: 'primary', attempt: 1 });
  });

  test('UT-RED-006 Masked IDs show only a short start and end', () => {
    expect(maskIdentifier('qa-auto-20260926t101500-9f3a-w1-4-email')).toBe('qa-a…mail');
    expect(maskIdentifier('short')).toBe('s…');
  });

  test('UT-RED-007 Log lines copied from another logger are scrubbed again', () => {
    const source = new Logger();
    source.error('HTTP transport failure', {
      endpoint: 'healthReady',
      requestId: REQUEST_ID,
      transportError: 'ECONNREFUSED',
    });
    const target = new Logger({ context: { test: 'PII-WR-001' } });
    target.replay(
      [...source.lines(), 'not json', JSON.stringify({ msg: `leak ${EMAIL}`, level: 'info', value: EMAIL })],
      { phase: 'preflight' },
    );
    const [first, second] = target.lines().map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(first).toMatchObject({
      msg: 'HTTP transport failure',
      level: 'error',
      test: 'PII-WR-001',
      phase: 'preflight',
      requestId: REQUEST_ID,
    });
    expect(target.lines()).toHaveLength(2);
    expect(JSON.stringify(second)).not.toContain(EMAIL);
  });

  test('UT-RED-008 Bearer tokens and Authorization headers are never logged, by key or as free text', () => {
    const token = 'deadbeef0123456789abcdef01234567'; // synthetic, 32 hex chars like the Aisle token
    const out = redact({ headers: { Authorization: `Bearer ${token}` }, authorization: token }) as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(out)).not.toContain(token);
    expect(scrubText(`request failed: Authorization: Bearer ${token}`)).not.toContain(token);
    expect(scrubText(`curl -H "Authorization: bearer ${token}"`)).not.toContain(token);
  });
});
