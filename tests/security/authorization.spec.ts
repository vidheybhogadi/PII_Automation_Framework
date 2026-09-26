/**
 * Guide "Field authorization" — per-field READ / WRITE / SEARCH / BULK_READ and FREE_TEXT capability.
 *
 * Uses the LIMITED caller, which must be registered with EXACTLY this permission set
 * (docs/setup-guide.md §4):
 *     EMAIL: SEARCH      NAME: READ      PHONE: (none)      BULK_READ: (none)      FREE_TEXT: (none)
 * AZ-004 and AZ-005 are positive controls that prove the limited caller is configured as expected, so a
 * 403 elsewhere is attributable to the missing permission and not to a broken caller registration.
 */
import { expectError, expectSuccess } from '../../src/assertions/response.assertions';
import {
  createKey,
  createTransient,
  expectNotPersisted,
  seedField,
  seedUser,
} from '../../src/fixtures/steps';
import { expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { readPiiDataSchema, searchIdsOnlyDataSchema } from '../../src/models/pii.models';

const DENIED = ERROR_CODES.AUTHORIZATION_DENIED;

test.describe('Authorization (field permissions)', { tag: ['@security', '@regression'] }, () => {
  onlyIfInScope('writePii', 'readPii', 'searchPii', 'batchReadPii');

  test('PII-AZ-001 Caller not allowed to save emails cannot save one (403) and nothing is saved', async ({
    piiAs,
    pii,
    data,
    tenant,
  }) => {
    const userId = data.userId('az1');
    expectError(
      await piiAs('limited').writePii({
        tenant_id: tenant,
        user_id: userId,
        field: 'EMAIL',
        value: data.email(),
      }),
      403,
      DENIED,
    );
    await expectNotPersisted(pii, { tenant, userId, field: 'EMAIL' });
  });

  test('PII-AZ-002 Caller not allowed to read emails cannot read one (403)', async ({
    piiAs,
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('az2');
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: data.email() });
    expectError(
      await piiAs('limited').readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL'] }),
      403,
      DENIED,
    );
  });

  test('PII-AZ-003 Reading NAME (allowed) and EMAIL (not allowed) together is refused as a whole (403)', async ({
    piiAs,
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('az3');
    await seedUser(pii, cleanup, tenant, userId, { NAME: data.name(), EMAIL: data.email() });
    expectError(
      await piiAs('limited').readPii({ tenant_id: tenant, user_id: userId, field_names: ['NAME', 'EMAIL'] }),
      403,
      DENIED,
    );
  });

  test('PII-AZ-004 Control check: the limited caller CAN read names, which it is allowed to do', async ({
    piiAs,
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('az4');
    await seedField(pii, cleanup, { tenant, userId, field: 'NAME', value: data.name() });
    const read = expectSuccess(
      await piiAs('limited').readPii({ tenant_id: tenant, user_id: userId, field_names: ['NAME'] }),
      200,
      readPiiDataSchema,
    );
    expect(read.count).toBe(1);
  });

  test('PII-AZ-005 Control check: the limited caller CAN search emails when it does not ask for the values', async ({
    piiAs,
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('az5');
    const email = data.email();
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email });
    const result = expectSuccess(
      await piiAs('limited').searchPii('EMAIL', { tenant_id: tenant, value: email, include_values: false }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(result.matches).toEqual([{ user_id: userId }]);
  });

  test('PII-AZ-006 Searching emails AND asking for the values needs read permission too (403 without it)', async ({
    piiAs,
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const email = data.email();
    await seedField(pii, cleanup, { tenant, userId: data.userId('az6'), field: 'EMAIL', value: email });
    const res = await piiAs('limited').searchPii('EMAIL', {
      tenant_id: tenant,
      value: email,
      include_values: true,
    });
    expectError(res, 403, DENIED);
    expect(res.rawText().toLowerCase().includes(email), '403 must not leak the value').toBe(false);
  });

  test('PII-AZ-007 Caller not allowed to search phones cannot search them (403)', async ({
    piiAs,
    data,
    tenant,
  }) => {
    expectError(
      await piiAs('limited').searchPii('PHONE', { tenant_id: tenant, value: data.phone(0).normalized }),
      403,
      DENIED,
    );
  });

  test('PII-AZ-008 Caller without bulk-read permission cannot use bulk read, even for names it may read (403)', async ({
    piiAs,
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('az8');
    await seedField(pii, cleanup, { tenant, userId, field: 'NAME', value: data.name() });
    expectError(
      await piiAs('limited').batchReadPii({ tenant_id: tenant, user_ids: [userId], fields: ['NAME'] }),
      403,
      DENIED,
    );
  });

  test('PII-AZ-009 Caller not allowed to save phones cannot create or promote temporary phones (403)', async ({
    piiAs,
    pii,
    data,
    tenant,
    config,
  }) => {
    const limited = piiAs('limited');
    const ttl = config.limits.transientTtlMinSeconds;
    expectError(
      await limited.createTransientPhone({
        tenant_id: tenant,
        phone: data.phone(0).normalized,
        ttl_seconds: ttl,
      }),
      403,
      DENIED,
    );
    noteAssumption(
      'A-07',
      'Authorization is evaluated before ownership lookup, so a real foreign mapping yields 403 (not 404).',
    );
    const created = await createTransient(pii, { tenant, phone: data.phone(0).normalized, ttlSeconds: ttl });
    expectError(
      await limited.promoteTransientPhone({
        tenant_id: tenant,
        transient_id: created.transient_id,
        user_id: data.userId('az9'),
      }),
      403,
      DENIED,
    );
  });

  test('PII-AZ-010 Caller not allowed to read phones cannot look up a temporary phone (403)', async ({
    piiAs,
    pii,
    data,
    tenant,
    config,
  }) => {
    const created = await createTransient(pii, {
      tenant,
      phone: data.phone(0).normalized,
      ttlSeconds: config.limits.transientTtlMinSeconds,
    });
    expectError(
      await piiAs('limited').resolveTransientPhone({ tenant_id: tenant, transient_id: created.transient_id }),
      403,
      DENIED,
    );
  });

  test('PII-AZ-011 Caller without encryption-key permission cannot create, read or revoke keys (403)', async ({
    piiAs,
    pii,
    tenant,
    cleanup,
  }) => {
    const limited = piiAs('limited');
    expectError(await limited.createFreeTextKey({ tenant_id: tenant }), 403, DENIED);
    const key = await createKey(pii, cleanup, tenant);
    expectError(await limited.readFreeTextKey({ tenant_id: tenant, key_id: key.key_id }), 403, DENIED);
    expectError(await limited.revokeFreeTextKey({ tenant_id: tenant, key_id: key.key_id }), 403, DENIED);
  });

  test('PII-AZ-012 A 403 (not allowed) response is never retried automatically', async ({
    piiAs,
    data,
    tenant,
    log,
  }) => {
    await piiAs('limited').readPii({
      tenant_id: tenant,
      user_id: data.userId('az12'),
      field_names: ['EMAIL'],
    });
    expect(log.lines().filter((l) => l.includes('Retrying')).length).toBe(0);
    expect(log.lines().filter((l) => l.includes('"endpoint":"readPii"')).length).toBe(1);
  });
});
