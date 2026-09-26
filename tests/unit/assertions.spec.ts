/** UNIT — assertion helpers: correct verdicts AND failure messages that never contain sensitive values. */
import { expect, test } from '@playwright/test';
import {
  expectError,
  expectExactKeys,
  expectRejected,
  expectRequestValidationError,
  expectSuccess,
} from '../../src/assertions/response.assertions';
import {
  containsPlaintext,
  expectNoSecretsIn,
  expectNoStore,
  expectNotStoredAsPlaintext,
  expectSecretEquals,
} from '../../src/assertions/security.assertions';
import { ApiResponse } from '../../src/clients/api-response';
import { freeTextKeyDataSchema } from '../../src/models/free-text.models';
import { readPiiDataSchema, searchIdsOnlyDataSchema } from '../../src/models/pii.models';

const SECRET_EMAIL = 'private.person@corp.example';

function response(status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse {
  return new ApiResponse(
    'readPii',
    'POST',
    '/api/v1/pii/read',
    status,
    headers,
    'req-1',
    5,
    'caller',
    JSON.stringify(body),
  );
}

function failureMessage(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected assertion to fail');
}

const readOk = {
  status: true,
  message: 'PII read successful',
  data: {
    tenant_id: 't',
    user_id: 'u',
    items: [{ tenant_id: 't', user_id: 'u', field: 'EMAIL', value: SECRET_EMAIL }],
    count: 1,
  },
  error: null,
};

test.describe('UNIT assertions', () => {
  test('UT-AST-001 Success check returns the response data and verifies the message', () => {
    const data = expectSuccess(response(200, readOk), 200, readPiiDataSchema, 'PII read successful');
    expect(data.count).toBe(1);
  });

  test('UT-AST-002 A failed status or format check never prints response values', () => {
    const wrongStatus = failureMessage(() => expectSuccess(response(201, readOk), 200, readPiiDataSchema));
    expect(wrongStatus).toContain('HTTP 201');
    expect(wrongStatus).not.toContain(SECRET_EMAIL);

    const broken = { ...readOk, data: { ...readOk.data, count: 'one' } };
    const contract = failureMessage(() => expectSuccess(response(200, broken), 200, readPiiDataSchema));
    expect(contract).toContain('data.count');
    expect(contract).not.toContain(SECRET_EMAIL);
  });

  test('UT-AST-003 An IDs-only search result with any extra field is flagged (guards against leaks)', () => {
    const leaky = {
      status: true,
      message: 'x',
      data: {
        tenant_id: 't',
        field: 'EMAIL',
        matches: [{ user_id: 'u', value: SECRET_EMAIL }],
        count: 1,
        truncated: false,
      },
      error: null,
    };
    const message = failureMessage(() => expectSuccess(response(200, leaky), 200, searchIdsOnlyDataSchema));
    expect(message).toContain('data.matches.0');
    expect(message).not.toContain(SECRET_EMAIL);
  });

  test('UT-AST-004 Error check verifies the error format and code; the server message is scrubbed in failures', () => {
    const body = {
      status: false,
      message: 'denied',
      data: null,
      error: { code: 'AUTHORIZATION_DENIED', message: `no access for ${SECRET_EMAIL}` },
    };
    expect(expectError(response(403, body), 403, 'AUTHORIZATION_DENIED').error.code).toBe(
      'AUTHORIZATION_DENIED',
    );
    const message = failureMessage(() => expectError(response(403, body), 401, 'INVALID_SIGNATURE'));
    expect(message).not.toContain(SECRET_EMAIL);
    expect(message).toContain('code=AUTHORIZATION_DENIED');
  });

  test('UT-AST-005 A 422 response is accepted in either documented format, and nothing else', () => {
    expect(
      expectRequestValidationError(
        response(422, { detail: [{ loc: ['body', 'value'], msg: 'x', type: 'missing' }] }),
      ),
    ).toBe('fastapi-detail');
    expect(
      expectRequestValidationError(
        response(422, {
          status: false,
          message: 'x',
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'x' },
        }),
      ),
    ).toBe('error-envelope');
    expect(() => expectRequestValidationError(response(422, { oops: true }))).toThrow();
    expect(() => expectRejected(response(200, readOk), [400, 422], 'Q-00')).toThrow();
  });

  test('UT-AST-006 Field-list check names missing or extra fields, never their values', () => {
    expectExactKeys({ a: 1, b: 2 }, ['b', 'a'], 'obj');
    const message = failureMessage(() => expectExactKeys({ a: 1, leaked: SECRET_EMAIL }, ['a', 'b'], 'obj'));
    expect(message).toContain('leaked');
    expect(message).not.toContain(SECRET_EMAIL);
  });

  test('UT-AST-007 Comparing secret values prints fingerprints, never the values', () => {
    expectSecretEquals(SECRET_EMAIL, SECRET_EMAIL, 'email');
    const message = failureMessage(() => expectSecretEquals('other@corp.example', SECRET_EMAIL, 'email'));
    expect(message).toContain('sha256:');
    expect(message).not.toContain(SECRET_EMAIL);
    expect(message).not.toContain('other@corp.example');
  });

  test('UT-AST-008 Plain-text detection finds a value in text, hex, Base64 and raw bytes', () => {
    const plain = Buffer.from(SECRET_EMAIL);
    expect(containsPlaintext(plain, SECRET_EMAIL)).toBe(true);
    expect(containsPlaintext(plain.toString('hex'), SECRET_EMAIL)).toBe(true);
    expect(containsPlaintext(`prefix${plain.toString('base64')}`, SECRET_EMAIL)).toBe(true);
    expect(containsPlaintext(Buffer.from([1, 2, 3, 250, 99]), SECRET_EMAIL)).toBe(false);
    expect(() => expectNotStoredAsPlaintext(Buffer.from(`x${SECRET_EMAIL}`), SECRET_EMAIL, 'row')).toThrow();
    expect(() => expectNotStoredAsPlaintext(null, SECRET_EMAIL, 'row')).toThrow();
    expectNotStoredAsPlaintext(Buffer.from([9, 8, 7, 6]), SECRET_EMAIL, 'row');
  });

  test('UT-AST-009 Leak detection and the do-not-cache header check work', () => {
    expectNoSecretsIn(['{"status":200}'], [SECRET_EMAIL], 'logs');
    expect(() =>
      expectNoSecretsIn(['{"x":"PRIVATE.PERSON@corp.example"}'], [SECRET_EMAIL], 'logs'),
    ).toThrow();
    expectNoStore(response(200, readOk, { 'cache-control': 'private, no-store' }));
    expect(() => expectNoStore(response(200, readOk, { 'cache-control': 'no-cache' }))).toThrow();
  });

  test('UT-AST-010 An encryption key must be exactly 32 bytes in standard Base64', () => {
    const base = {
      tenant_id: 't',
      key_id: '28c2257a-f02b-47ea-829f-617901724724',
      algorithm: 'AES-256-GCM',
      status: 'ACTIVE',
      created_at: '2026-09-25T10:00:00Z',
    };
    expect(
      freeTextKeyDataSchema.safeParse({ ...base, key: 'odNqEN9fHP8rQw8UnpGgM9x74pVh5RCEb65o9UkwJxE=' })
        .success,
    ).toBe(true);
    expect(
      freeTextKeyDataSchema.safeParse({ ...base, key: Buffer.alloc(16).toString('base64') }).success,
    ).toBe(false);
    expect(freeTextKeyDataSchema.safeParse({ ...base, key: 'not base64!!' }).success).toBe(false);
  });
});
