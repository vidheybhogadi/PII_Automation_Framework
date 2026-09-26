/**
 * Guide "Authentication" — Ed25519 request authentication.
 * Every negative case uses the centralized client with a declared TamperOptions (no ad-hoc signing),
 * expects 401 with a documented auth error code, and then PROVES nothing was written (valid read -> 404).
 */
import { expectError, expectRejected, expectSuccess } from '../../src/assertions/response.assertions';
import { HEADER, serializeBody, type TamperOptions } from '../../src/clients/base-api-client';
import { identityFor } from '../../src/clients/client-factory';
import type { EndpointKey } from '../../src/clients/endpoints';
import { expectNotPersisted } from '../../src/fixtures/steps';
import { blockedBy, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { AUTH_ERROR_CODES, ERROR_CODES } from '../../src/models/common.models';
import { writePiiDataSchema, type WritePiiRequest } from '../../src/models/pii.models';
import type { Ed25519Signer } from '../../src/auth/ed25519-signer';

interface AuthCase {
  id: string;
  title: string;
  tamper: (ctx: { request: WritePiiRequest; unregistered: Ed25519Signer; runId: string }) => TamperOptions;
}

const CASES: AuthCase[] = [
  { id: 'AUTH-002', title: 'Request with no signature', tamper: () => ({ omitHeaders: [HEADER.SIGNATURE] }) },
  {
    id: 'AUTH-003',
    title: 'Request with an empty signature',
    tamper: () => ({ headers: { [HEADER.SIGNATURE]: '' } }),
  },
  {
    id: 'AUTH-004',
    title: 'Signature that is not valid Base64 text',
    tamper: () => ({ headers: { [HEADER.SIGNATURE]: 'not base64 !!!' } }),
  },
  {
    id: 'AUTH-005',
    title: 'Signature of the wrong length (32 bytes instead of 64)',
    tamper: () => ({ headers: { [HEADER.SIGNATURE]: Buffer.alloc(32, 7).toString('base64') } }),
  },
  {
    id: 'AUTH-006',
    title: 'Random signature of the right length',
    tamper: () => ({ headers: { [HEADER.SIGNATURE]: Buffer.alloc(64, 9).toString('base64') } }),
  },
  {
    id: 'AUTH-007',
    title: 'Signature made with a key the service does not know',
    tamper: ({ unregistered }) => ({ signWith: unregistered }),
  },
  {
    id: 'AUTH-008',
    title: 'Body changed after signing (different user_id)',
    tamper: ({ request }) => ({
      signOverBytes: serializeBody({ ...request, user_id: `${request.user_id}-original` }),
      bodyBytes: serializeBody(request),
    }),
  },
  {
    id: 'AUTH-009',
    title: 'Body re-formatted after signing (only spaces added)',
    tamper: ({ request }) => ({
      signOverBytes: serializeBody(request),
      bodyBytes: Buffer.from(JSON.stringify(request, null, 2), 'utf8'),
    }),
  },
  {
    id: 'AUTH-010',
    title: 'Newline added to the body after signing',
    tamper: ({ request }) => ({
      signOverBytes: serializeBody(request),
      bodyBytes: Buffer.concat([serializeBody(request), Buffer.from('\n')]),
    }),
  },
  {
    id: 'AUTH-011',
    title: 'Body signed without hashing it first (wrong signing method)',
    tamper: () => ({ signatureScheme: 'raw-body' }),
  },
  {
    id: 'AUTH-012',
    title: 'Request with no caller ID header',
    tamper: () => ({ omitHeaders: [HEADER.CALLER_ID] }),
  },
  {
    id: 'AUTH-013',
    title: 'Request with an unknown caller ID',
    tamper: ({ runId }) => ({ headers: { [HEADER.CALLER_ID]: `unregistered-${runId}` } }),
  },
  {
    id: 'AUTH-014',
    title: 'Request with an empty caller ID',
    tamper: () => ({ headers: { [HEADER.CALLER_ID]: '' } }),
  },
  {
    id: 'AUTH-015',
    title: 'Request with no request ID header',
    tamper: () => ({ omitHeaders: [HEADER.REQUEST_ID] }),
  },
  {
    id: 'AUTH-016',
    title: 'Request with no security headers at all',
    tamper: () => ({ unauthenticated: true }),
  },
];

test.describe('Authentication (Ed25519)', { tag: ['@security', '@regression'] }, () => {
  onlyIfInScope('writePii', 'readPii');

  test(
    'PII-AUTH-001 A correctly signed request is accepted (baseline for all signing tests)',
    { tag: '@smoke' },
    async ({ pii, data, tenant, cleanup }) => {
      const userId = data.userId('auth1');
      const res = await pii.writePii({
        tenant_id: tenant,
        user_id: userId,
        field: 'NAME',
        value: data.name(),
      });
      cleanup.leaveBehind('PII NAME', `${tenant}/${userId}`);
      expectSuccess(res, 201, writePiiDataSchema);
    },
  );

  for (const c of CASES) {
    test(`PII-${c.id} ${c.title} is rejected (401) and nothing is saved`, async ({
      pii,
      data,
      tenant,
      unregisteredSigner,
    }) => {
      const request: WritePiiRequest = {
        tenant_id: tenant,
        user_id: data.userId(c.id),
        field: 'NAME',
        value: data.name(),
      };
      const tamper = c.tamper({ request, unregistered: unregisteredSigner, runId: data.runId });
      const res = await pii.writePii(request, { tamper });
      expectError(res, 401, AUTH_ERROR_CODES);
      await expectNotPersisted(pii, { tenant, userId: request.user_id, field: 'NAME' });
    });
  }

  test('PII-AUTH-017 One caller’s key cannot be used to sign as a different caller (401)', async ({
    pii,
    data,
    tenant,
    config,
  }) => {
    // Sign with the SECONDARY caller's (registered) key while sending the PRIMARY caller ID.
    const secondarySigner = identityFor(config, 'secondary').signer;
    const request: WritePiiRequest = {
      tenant_id: tenant,
      user_id: data.userId('auth17'),
      field: 'NAME',
      value: data.name(),
    };
    expectError(
      await pii.writePii(request, { tamper: { signWith: secondarySigner } }),
      401,
      AUTH_ERROR_CODES,
    );
    await expectNotPersisted(pii, { tenant, userId: request.user_id, field: 'NAME' });
  });

  test('PII-AUTH-018 Request without a Content-Type header is rejected (exact status is open question Q-13)', async ({
    pii,
    data,
    tenant,
  }) => {
    noteAssumption(
      'Q-13',
      'Guide lists Content-Type as required but not the status when absent; 400/401/415/422 accepted.',
    );
    const request: WritePiiRequest = {
      tenant_id: tenant,
      user_id: data.userId('auth18'),
      field: 'NAME',
      value: data.name(),
    };
    expectRejected(
      await pii.writePii(request, { tamper: { omitHeaders: [HEADER.CONTENT_TYPE] } }),
      [400, 401, 415, 422],
      'Q-13',
    );
    await expectNotPersisted(pii, { tenant, userId: request.user_id, field: 'NAME' });
  });

  test('PII-AUTH-019 A bad signature is caught before permissions are checked: 401 (not signed in), never 403', async ({
    piiAs,
    data,
    tenant,
    unregisteredSigner,
  }) => {
    const limited = piiAs('limited'); // lacks WRITE on EMAIL
    const request: WritePiiRequest = {
      tenant_id: tenant,
      user_id: data.userId('auth19'),
      field: 'EMAIL',
      value: data.email(),
    };
    expectError(
      await limited.writePii(request, { tamper: { signWith: unregisteredSigner } }),
      401,
      AUTH_ERROR_CODES,
    );
    // Same request correctly signed -> 403: the two failure classes are distinguishable.
    expectError(await limited.writePii(request), 403, ERROR_CODES.AUTHORIZATION_DENIED);
  });

  test('PII-AUTH-020 Every /api/v1 endpoint rejects an unsigned request (401)', async ({ pii, tenant }) => {
    const bodies: Partial<Record<EndpointKey, unknown>> = {
      readPii: { tenant_id: tenant, user_id: 'u', field_names: ['EMAIL'] },
      batchReadPii: { tenant_id: tenant, user_ids: ['u'], fields: ['EMAIL'] },
      createTransientPhone: { tenant_id: tenant, phone: '123-4567', ttl_seconds: 300 },
      resolveTransientPhone: { tenant_id: tenant, transient_id: '00000000-0000-4000-8000-000000000000' },
      promoteTransientPhone: {
        tenant_id: tenant,
        transient_id: '00000000-0000-4000-8000-000000000000',
        user_id: 'u',
      },
      createFreeTextKey: { tenant_id: tenant },
      readFreeTextKey: { tenant_id: tenant, key_id: '00000000-0000-4000-8000-000000000000' },
      revokeFreeTextKey: { tenant_id: tenant, key_id: '00000000-0000-4000-8000-000000000000' },
    };
    for (const [key, body] of Object.entries(bodies) as [EndpointKey, unknown][]) {
      await test.step(key, async () => {
        expectError(
          await pii.call(key, body, { tamper: { unauthenticated: true }, retry: false }),
          401,
          AUTH_ERROR_CODES,
        );
      });
    }
    await test.step('searchPii', async () => {
      expectError(
        await pii.searchPii(
          'EMAIL',
          { tenant_id: tenant, value: 'x' },
          { tamper: { unauthenticated: true } },
        ),
        401,
        AUTH_ERROR_CODES,
      );
    });
  });

  test('PII-AUTH-021 Sending the same request ID twice (expected behaviour not documented yet)', async () => {
    blockedBy(
      'Q-14',
      'Guide requires a fresh ID per call but does not define server behaviour on reuse (reject vs accept).',
    );
  });

  test('PII-AUTH-022 Re-sending a captured signed request (replay) (expected behaviour not documented yet)', async () => {
    blockedBy(
      'Q-21',
      'Signature covers only the body (no timestamp/nonce/path). Replay protection is undocumented.',
    );
  });
});
