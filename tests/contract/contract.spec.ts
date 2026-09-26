/**
 * Contract tests.
 *  - CON-001/002: the service's own OpenAPI schema vs. the guide's endpoint inventory (catches drift in
 *    either direction — a documented endpoint missing, or an undocumented /api/v1 endpoint present).
 *  - CON-003..005: success/error payloads contain EXACTLY the documented keys. An extra key in a PII
 *    response is treated as a contract (and potential data-exposure) failure.
 */
import { expectExactKeys, expectSuccess } from '../../src/assertions/response.assertions';
import { ENDPOINTS } from '../../src/clients/endpoints';
import { createKey, createTransient } from '../../src/fixtures/steps';
import { blockedBy, expect, test } from '../../src/fixtures/test-fixtures';
import { ENVELOPE_KEYS } from '../../src/models/common.models';
import {
  FREE_TEXT_KEY_DATA_KEYS,
  REVOKE_FREE_TEXT_KEY_DATA_KEYS,
  freeTextKeyDataSchema,
  revokeFreeTextKeyDataSchema,
} from '../../src/models/free-text.models';
import {
  BATCH_READ_DATA_KEYS,
  PII_ITEM_KEYS,
  READ_PII_DATA_KEYS,
  SEARCH_DATA_KEYS,
  WRITE_PII_DATA_KEYS,
  batchReadDataSchema,
  readPiiDataSchema,
  searchIdsOnlyDataSchema,
  searchWithValuesDataSchema,
  writePiiDataSchema,
} from '../../src/models/pii.models';
import {
  CREATE_TRANSIENT_DATA_KEYS,
  PROMOTE_TRANSIENT_DATA_KEYS,
  RESOLVE_TRANSIENT_DATA_KEYS,
  promoteTransientPhoneDataSchema,
  resolveTransientPhoneDataSchema,
} from '../../src/models/transient.models';

type OpenApiDoc = { paths?: Record<string, Record<string, unknown>> };
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

test.describe('Contract', { tag: ['@contract', '@regression'] }, () => {
  test(
    'PII-CON-001 The API description (OpenAPI) is available and lists every documented endpoint',
    { tag: '@smoke' },
    async ({ pii }) => {
      const res = await pii.getOpenApiSchema();
      if (res.status === 404) {
        blockedBy(
          'Q-24',
          'OpenAPI is not exposed in this environment; endpoint drift cannot be checked here.',
        );
        return;
      }
      expect(res.status, res.summary()).toBe(200);
      const doc = res.json() as OpenApiDoc;
      const missing = Object.values(ENDPOINTS)
        .filter((e) => !doc.paths?.[e.path]?.[e.method.toLowerCase()])
        .map((e) => `${e.method} ${e.path}`);
      expect(missing, 'documented endpoints missing from /openapi.json').toEqual([]);
    },
  );

  test('PII-CON-002 The API description has no extra, undocumented endpoints', async ({ pii }) => {
    const res = await pii.getOpenApiSchema();
    if (res.status === 404) {
      blockedBy('Q-24', 'OpenAPI is not exposed in this environment.');
      return;
    }
    const doc = res.json() as OpenApiDoc;
    const documented = new Set(Object.values(ENDPOINTS).map((e) => `${e.method} ${e.path}`));
    const extra = Object.entries(doc.paths ?? {})
      .filter(([path]) => path.startsWith('/api/v1'))
      .flatMap(([path, ops]) =>
        Object.keys(ops)
          .filter((m) => HTTP_METHODS.includes(m))
          .map((m) => `${m.toUpperCase()} ${path}`),
      )
      .filter((op) => !documented.has(op));
    expect(extra, 'undocumented /api/v1 operations (update the guide or the inventory)').toEqual([]);
  });

  test('PII-CON-003 Save, read, search and bulk-read responses contain exactly the documented fields', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('con3');
    const email = data.email();

    const write = await pii.writePii({ tenant_id: tenant, user_id: userId, field: 'EMAIL', value: email });
    cleanup.leaveBehind('PII EMAIL', `${tenant}/${userId}`);
    expectExactKeys(write.json(), ENVELOPE_KEYS, 'write envelope');
    expectExactKeys(expectSuccess(write, 201, writePiiDataSchema), WRITE_PII_DATA_KEYS, 'write data');

    const read = expectSuccess(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL'] }),
      200,
      readPiiDataSchema,
    );
    expectExactKeys(read, READ_PII_DATA_KEYS, 'read data');
    expectExactKeys(read.items[0], PII_ITEM_KEYS, 'read item');

    const ids = expectSuccess(
      await pii.searchPii('EMAIL', { tenant_id: tenant, value: email }),
      200,
      searchIdsOnlyDataSchema,
    );
    expectExactKeys(ids, SEARCH_DATA_KEYS, 'search data (ids only)');
    expectExactKeys(ids.matches[0], ['user_id'], 'search match (ids only)');

    const values = expectSuccess(
      await pii.searchPii('EMAIL', { tenant_id: tenant, value: email, include_values: true }),
      200,
      searchWithValuesDataSchema,
    );
    expectExactKeys(values.matches[0], PII_ITEM_KEYS, 'search match (with values)');

    const batch = expectSuccess(
      await pii.batchReadPii({ tenant_id: tenant, user_ids: [userId], fields: ['EMAIL'] }),
      200,
      batchReadDataSchema,
    );
    expectExactKeys(batch, BATCH_READ_DATA_KEYS, 'batch data');
    expectExactKeys(batch.items[0], PII_ITEM_KEYS, 'batch item');
  });

  test('PII-CON-004 Temporary-phone responses contain exactly the documented fields', async ({
    pii,
    data,
    tenant,
    config,
    cleanup,
  }) => {
    const created = await createTransient(pii, {
      tenant,
      phone: data.phone(0).normalized,
      ttlSeconds: config.limits.transientTtlMinSeconds,
    });
    expectExactKeys(created, CREATE_TRANSIENT_DATA_KEYS, 'transient create data');
    const resolved = expectSuccess(
      await pii.resolveTransientPhone({ tenant_id: tenant, transient_id: created.transient_id }),
      200,
      resolveTransientPhoneDataSchema,
    );
    expectExactKeys(resolved, RESOLVE_TRANSIENT_DATA_KEYS, 'transient resolve data');
    const userId = data.userId('con4');
    const promoted = expectSuccess(
      await pii.promoteTransientPhone({
        tenant_id: tenant,
        transient_id: created.transient_id,
        user_id: userId,
      }),
      200,
      promoteTransientPhoneDataSchema,
    );
    cleanup.leaveBehind('PII PHONE', `${tenant}/${userId}`);
    expectExactKeys(promoted, PROMOTE_TRANSIENT_DATA_KEYS, 'transient promote data');
  });

  test('PII-CON-005 Encryption-key responses and error responses contain exactly the documented fields', async ({
    pii,
    tenant,
    cleanup,
  }) => {
    const created = await createKey(pii, cleanup, tenant);
    expectExactKeys(created, FREE_TEXT_KEY_DATA_KEYS, 'key create data');
    const read = expectSuccess(
      await pii.readFreeTextKey({ tenant_id: tenant, key_id: created.key_id }),
      200,
      freeTextKeyDataSchema,
    );
    expectExactKeys(read, FREE_TEXT_KEY_DATA_KEYS, 'key read data');
    const revoked = expectSuccess(
      await pii.revokeFreeTextKey({ tenant_id: tenant, key_id: created.key_id }),
      200,
      revokeFreeTextKeyDataSchema,
    );
    expectExactKeys(revoked, REVOKE_FREE_TEXT_KEY_DATA_KEYS, 'key revoke data');

    const notFound = await pii.readFreeTextKey({ tenant_id: tenant, key_id: created.key_id });
    expect(notFound.status).toBe(404);
    expectExactKeys(notFound.json(), ENVELOPE_KEYS, 'error envelope');
    expectExactKeys((notFound.json() as { error: unknown }).error, ['code', 'message'], 'error object');
  });
});
