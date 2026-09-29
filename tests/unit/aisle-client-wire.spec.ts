/**
 * UNIT — what the Aisle PII client puts on the wire (headers, body bytes, retries, secrecy).
 * Runs against a local capture server only; it says nothing about the real Aisle service.
 */
import { expect, test } from '@playwright/test';
import { expectUnauthorized, expectValidationError } from '../../src/assertions/response.assertions';
import { AislePiiClient } from '../../src/clients/aisle-pii-client';
import { ApiTransportError } from '../../src/clients/base-api-client';
import { registerSecretValue } from '../../src/utils/redaction';
import { Logger } from '../../src/utils/logger';
import { Secret } from '../../src/utils/secret';
import { CaptureServer } from './helpers/capture-server';

/** Synthetic token — NOT a real credential (32 hex chars, like the Aisle test token). */
const TOKEN = '0123456789abcdef0123456789abcdef';
registerSecretValue(TOKEN);

const server = new CaptureServer();
test.beforeAll(async () => server.start());
test.afterAll(async () => server.stop());
test.beforeEach(() => {
  server.requests.length = 0;
});

function client(logger = new Logger({ level: 'debug' }), baseUrl = server.baseUrl): AislePiiClient {
  return new AislePiiClient({
    baseUrl,
    timeoutMs: 5_000,
    retryPolicy: { maxRetries: 2, baseDelayMs: 0 },
    logger,
    token: new Secret(TOKEN),
  });
}

test.describe('UNIT Aisle client wire behaviour', () => {
  test('UT-ACL-001 Every call carries "Authorization: Bearer <token>" and JSON content type, added centrally', async () => {
    await client().writePii({ user_id: 'u1', field: 'NAME', value: 'Qa Name' });
    await client().healthReady();
    const [write, health] = server.requests;
    expect(write?.method).toBe('POST');
    expect(write?.url).toBe('/api/v1/pii-test');
    expect(write?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(write?.headers['content-type']).toBe('application/json');
    expect(write?.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(health?.method).toBe('GET');
    expect(health?.url).toBe('/api/v1/pii-test/health/ready');
    expect(health?.headers.authorization).toBe(`Bearer ${TOKEN}`); // health also needs the token
    expect(health?.headers['content-type']).toBeUndefined(); // no body, no content type
  });

  test('UT-ACL-002 No tenant_id, caller ID or signature is ever sent — Aisle adds those itself', async () => {
    const payload = { user_id: 'u1', field: 'NAME', value: 'Qa Name' };
    await client().writePii(payload);
    const req = server.requests[0];
    expect(req?.body.toString('utf8')).toBe(JSON.stringify(payload));
    expect(req?.body.toString('utf8')).not.toContain('tenant_id');
    const names = Object.keys(req?.headers ?? {});
    expect(names.filter((h) => /x-pii-|signature|caller/i.test(h))).toEqual([]);
  });

  test('UT-ACL-003 The token never appears in the call log or in response summaries', async () => {
    const logger = new Logger({ level: 'debug' });
    const res = await client(logger).readPii({ user_id: 'u1', field_names: ['NAME'] });
    const text = `${logger.lines().join('\n')} ${res.summary()} ${String(res)} ${JSON.stringify(res)}`;
    expect(text).not.toContain(TOKEN);
    expect(logger.lines().join('\n')).toContain('"auth":"token"'); // how it authenticated, not with what
  });

  test('UT-ACL-004 A network failure message names the call but never the token or the body', async () => {
    const dead = client(new Logger({ level: 'debug' }), 'http://127.0.0.1:1');
    const err = await dead.writePii({ user_id: 'u1', field: 'NAME', value: 'Secret Name' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiTransportError);
    expect(String(err.message)).toContain('POST /api/v1/pii-test');
    expect(String(err.message)).not.toContain(TOKEN);
    expect(String(err.message)).not.toContain('Secret Name');
  });

  test('UT-ACL-005 A 401 with an empty text/html body (what Aisle returns) is handled as "unauthorized"', async () => {
    server.enqueue({ status: 401, body: '', headers: { 'content-type': 'text/html' } });
    const res = await client().readPii({ user_id: 'u1', field_names: ['NAME'] });
    expect(res.status).toBe(401);
    expect(res.json()).toBeUndefined();
    expectUnauthorized(res);
  });

  test('UT-ACL-006 Reads are retried on 503; writes and 401/403 answers are never retried', async () => {
    server.enqueue({ status: 503 }, { status: 200 });
    await client().readPii({ user_id: 'u1', field_names: ['NAME'] });
    expect(server.requests).toHaveLength(2);

    server.requests.length = 0;
    server.enqueue({ status: 503 });
    await client().writePii({ user_id: 'u1', field: 'NAME', value: 'x' });
    expect(server.requests).toHaveLength(1);

    server.requests.length = 0;
    server.enqueue({ status: 403 });
    await client().readPii({ user_id: 'u1', field_names: ['NAME'] });
    expect(server.requests).toHaveLength(1);
  });

  test('UT-ACL-007 Negative-test options: no token, a custom header, no content type, raw bytes', async () => {
    const c = client();
    await c.call('readPii', { user_id: 'u1', field_names: ['NAME'] }, { tamper: { authorization: null } });
    await c.call('readPii', {}, { tamper: { authorization: 'Token abc' } });
    await c.call('writePii', { a: 1 }, { tamper: { omitContentType: true } });
    await c.call('writePii', undefined, { tamper: { bodyBytes: Buffer.from('{"user_id":') } });
    const [none, custom, noType, raw] = server.requests;
    expect(none?.headers.authorization).toBeUndefined();
    expect(custom?.headers.authorization).toBe('Token abc');
    expect(noType?.headers['content-type']).toBeUndefined();
    expect(raw?.body.toString('utf8')).toBe('{"user_id":');
  });

  test('UT-ACL-008 The search field is URL-encoded into the path; 422 issues are read without the echoed input', async () => {
    await client().searchPii('EMAIL', { value: 'x', limit: 1, include_values: false });
    expect(server.requests[0]?.url).toBe('/api/v1/pii-test/EMAIL/search');

    const body = {
      detail: [
        { type: 'missing', loc: ['body', 'user_id'], msg: 'Field required', input: { value: 'Echoed Name' } },
      ],
    };
    server.enqueue({ status: 422, body: JSON.stringify(body) });
    const res = await client().writePii({ user_id: '', field: 'NAME', value: 'Echoed Name' });
    expectValidationError(res, 'user_id');
    expect(res.validationIssues).toEqual(['body.user_id:missing']);
    expect(res.validationIssues.join(' ')).not.toContain('Echoed Name');
  });
});
