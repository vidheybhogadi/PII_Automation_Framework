/**
 * UNIT — PiiClient wire behaviour against a local capture server (NOT the PII service).
 * Proves: the transmitted bytes are exactly the signed bytes; headers are correct; tamper options work;
 * retries are bounded and only for retry-safe endpoints; nothing sensitive reaches logs.
 */
import { expect, test } from '@playwright/test';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { inspect } from 'node:util';
import { Ed25519Signer, verifyBodySignature } from '../../src/auth/ed25519-signer';
import { HEADER, serializeBody } from '../../src/clients/base-api-client';
import { ENDPOINTS } from '../../src/clients/endpoints';
import { PiiClient } from '../../src/clients/pii-client';
import { Logger } from '../../src/utils/logger';
import { runInPhase } from '../../src/utils/phase';
import { isUuidV4 } from '../../src/utils/request-id';
import { CaptureServer } from './helpers/capture-server';
import { RFC8032_TEST1_PRIVATE_KEY_PEM } from './helpers/test-keys';

const signer = Ed25519Signer.fromPem(RFC8032_TEST1_PRIVATE_KEY_PEM, 'unit-test');
const CALLER = 'unit-test-caller';
const SAMPLE_EMAIL = 'Unit.Person@Sample.example';
const writeRequest = {
  tenant_id: 'tenant-unit',
  user_id: 'user-unit-1',
  field: 'EMAIL',
  value: SAMPLE_EMAIL,
};

let server: CaptureServer;
let logger: Logger;
let client: PiiClient;

test.describe('UNIT PiiClient wire behaviour (local capture server)', () => {
  test.beforeEach(async () => {
    server = new CaptureServer();
    await server.start();
    logger = new Logger({ level: 'debug' });
    client = new PiiClient({
      baseUrl: server.baseUrl,
      timeoutMs: 5_000,
      retryPolicy: { maxRetries: 2, baseDelayMs: 1 },
      logger,
      identity: { callerId: CALLER, signer },
    });
  });

  test.afterEach(async () => {
    await server.stop();
  });

  test('UT-CLI-001 The bytes sent are exactly the bytes that were signed', async () => {
    await client.writePii(writeRequest);
    const [req] = server.requests;
    expect(req).toBeDefined();
    const signature = req?.headers['x-pii-signature'] as string;
    expect(verifyBodySignature(signer.publicKey, req!.body, signature)).toBe(true);
    expect(req!.body.equals(serializeBody(writeRequest))).toBe(true);
    expect(req!.headers['content-length']).toBe(String(req!.body.length));
  });

  test('UT-CLI-002 Every request carries the documented headers (guide + tech doc) with correct values', async () => {
    await client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['EMAIL'] });
    const headers = server.requests[0]!.headers;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-pii-caller-id']).toBe(CALLER);
    expect(isUuidV4(headers['x-request-id'] as string)).toBe(true);
    // Tech doc v3 §11.1: the same UUIDv4 under X-PII-Request-Id, and the hex SHA-256 of the exact body bytes.
    expect(headers['x-pii-request-id']).toBe(headers['x-request-id']);
    expect(headers['x-pii-body-hash']).toBe(
      createHash('sha256').update(server.requests[0]!.body).digest('hex'),
    );
    expect(headers['x-pii-signature']).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    expect(server.requests[0]!.method).toBe('POST');
    expect(server.requests[0]!.url).toBe('/api/v1/pii/read');
  });

  test('UT-CLI-003 Every request gets a new, unique request ID', async () => {
    await client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['EMAIL'] });
    await client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['EMAIL'] });
    const [a, b] = server.requests.map((r) => r.headers['x-request-id']);
    expect(a).not.toBe(b);
  });

  test('UT-CLI-004 The search field name is safely encoded into the URL', async () => {
    await client.searchPii('EMAIL', { tenant_id: 't', value: 'x@y.example' });
    await client.searchPii('A B/C', { tenant_id: 't', value: 'x' });
    expect(server.requests.map((r) => r.url)).toEqual([
      '/api/v1/pii/EMAIL/search',
      '/api/v1/pii/A%20B%2FC/search',
    ]);
  });

  test('UT-CLI-005 The health check is sent without security headers or a body', async () => {
    await client.healthReady();
    const req = server.requests[0]!;
    expect(req.method).toBe('GET');
    expect(req.headers['x-pii-signature']).toBeUndefined();
    expect(req.headers['x-pii-caller-id']).toBeUndefined();
    expect(req.headers['x-pii-body-hash']).toBeUndefined();
    expect(req.body.length).toBe(0);
  });

  test('UT-CLI-006 Tests can remove headers, and no Content-Type is added behind their back', async () => {
    await client.writePii(writeRequest, {
      tamper: { omitHeaders: [HEADER.SIGNATURE, HEADER.CONTENT_TYPE, HEADER.CALLER_ID, HEADER.REQUEST_ID] },
    });
    const headers = server.requests[0]!.headers;
    expect(headers['x-pii-signature']).toBeUndefined();
    expect(headers['content-type']).toBeUndefined();
    expect(headers['x-pii-caller-id']).toBeUndefined();
    expect(headers['x-request-id']).toBeUndefined();
    expect(headers['x-pii-request-id']).toBeUndefined(); // "no request ID" removes both spellings
  });

  test('UT-CLI-007 Tests can deliberately send a body that differs from what was signed', async () => {
    const tampered = serializeBody({ ...writeRequest, user_id: 'someone-else' });
    await client.writePii(writeRequest, {
      tamper: { bodyBytes: tampered, signOverBytes: serializeBody(writeRequest) },
    });
    const req = server.requests[0]!;
    expect(req.body.equals(tampered)).toBe(true);
    expect(verifyBodySignature(signer.publicKey, req.body, req.headers['x-pii-signature'] as string)).toBe(
      false,
    );
  });

  test('UT-CLI-008 Tests can sign with another key or the wrong method while keeping the caller ID', async () => {
    const other = Ed25519Signer.fromKeyObject(generateKeyPairSync('ed25519').privateKey, 'other');
    await client.writePii(writeRequest, { tamper: { signWith: other } });
    await client.writePii(writeRequest, { tamper: { signatureScheme: 'raw-body' } });
    const [wrongKey, rawScheme] = server.requests;
    expect(wrongKey!.headers['x-pii-caller-id']).toBe(CALLER);
    expect(
      verifyBodySignature(signer.publicKey, wrongKey!.body, wrongKey!.headers['x-pii-signature'] as string),
    ).toBe(false);
    expect(
      verifyBodySignature(signer.publicKey, rawScheme!.body, rawScheme!.headers['x-pii-signature'] as string),
    ).toBe(false);
  });

  test('UT-CLI-009 Read-only calls retry on 503 with a new request ID, a limited number of times', async () => {
    const unavailable = {
      status: 503,
      body: JSON.stringify({
        status: false,
        message: 'x',
        data: null,
        error: { code: 'KEY_UNAVAILABLE', message: 'x' },
      }),
    };
    server.enqueue(unavailable, unavailable, unavailable, unavailable);
    const res = await client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['EMAIL'] });
    expect(res.status).toBe(503);
    expect(server.requests).toHaveLength(3); // 1 + maxRetries(2)
    expect(new Set(server.requests.map((r) => r.headers['x-request-id'])).size).toBe(3);
  });

  test('UT-CLI-010 Saves are never retried, and 401/403 responses are never retried', async () => {
    server.enqueue({ status: 503 }, { status: 401 }, { status: 403 });
    expect((await client.writePii(writeRequest)).status).toBe(503);
    expect((await client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['E'] })).status).toBe(401);
    expect((await client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['E'] })).status).toBe(403);
    expect(server.requests).toHaveLength(3);
    // Registry sanity: only read-only endpoints are retry-safe.
    const retrySafe = Object.values(ENDPOINTS)
      .filter((e) => e.retrySafe)
      .map((e) => e.key)
      .sort();
    expect(retrySafe).toEqual([
      'batchReadPii',
      'healthReady',
      'readFreeTextKey',
      'readPii',
      'resolveTransientPhone',
      'searchPii',
    ]);
  });

  test('UT-CLI-011 Non-JSON and empty responses are handled, and response bodies are never printed', async () => {
    server.enqueue({ status: 502, body: '<html>bad gateway</html>' });
    const res = await client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['EMAIL'] });
    expect(res.status).toBe(502);
    expect(res.isJson).toBe(false);

    server.enqueue({
      status: 200,
      body: JSON.stringify({
        status: true,
        message: 'm',
        data: { key: 'SECRETKEYMATERIAL', value: SAMPLE_EMAIL },
        error: null,
      }),
    });
    const secretRes = await client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['EMAIL'] });
    const rendered = `${inspect(secretRes)} ${JSON.stringify({ secretRes })} ${String(secretRes)}`;
    expect(rendered).not.toContain('SECRETKEYMATERIAL');
    expect(rendered).not.toContain(SAMPLE_EMAIL);
    expect(Object.keys(secretRes)).not.toContain('body');
  });

  test('UT-CLI-012 Logs contain request details but no personal data, signatures or bodies', async () => {
    await client.writePii(writeRequest);
    const signature = server.requests[0]!.headers['x-pii-signature'] as string;
    const log = logger.lines().join('\n');
    expect(log).toContain('/api/v1/pii');
    expect(log).toContain(server.requests[0]!.headers['x-request-id'] as string);
    expect(log).not.toContain(SAMPLE_EMAIL);
    expect(log.toLowerCase()).not.toContain(SAMPLE_EMAIL.toLowerCase());
    expect(log).not.toContain(signature);
  });

  test('UT-CLI-013 Calling a signed endpoint with no caller set up fails early with a clear message', async () => {
    const anonymous = new PiiClient({
      baseUrl: server.baseUrl,
      timeoutMs: 1_000,
      retryPolicy: { maxRetries: 0, baseDelayMs: 0 },
      logger,
    });
    await expect(anonymous.writePii(writeRequest)).rejects.toThrow(/requires authentication/);
    expect(server.requests).toHaveLength(0);
  });

  test('UT-CLI-014 Network errors are reported without the request body or headers', async () => {
    await server.stop();
    const err = await client.writePii(writeRequest).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/failed before an HTTP response/);
    expect((err as Error).message).not.toContain(SAMPLE_EMAIL);
    await server.start(); // keep afterEach symmetric
  });

  test('UT-CLI-015 Every logged call is labelled as test, setup or verification', async () => {
    await client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['EMAIL'] });
    await runInPhase('setup', () => client.writePii(writeRequest));
    await runInPhase('verify', async () => {
      await Promise.all([
        client.readPii({ tenant_id: 't', user_id: 'u', field_names: ['EMAIL'] }),
        client.healthReady(),
      ]);
    });
    const phases = logger.lines().map((l) => (JSON.parse(l) as { phase?: string }).phase);
    expect(phases).toEqual(['test', 'setup', 'verify', 'verify']);
  });
});
