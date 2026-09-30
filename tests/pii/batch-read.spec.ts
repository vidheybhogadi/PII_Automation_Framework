/** Bulk read — POST /api/v1/pii-test/batch/read through the Aisle facade (observed behaviour). */
import { expectError, expectSuccess, expectValidationError } from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { seedField } from '../../src/fixtures/steps';
import { expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { batchReadDataSchema, LIMITS, PII_FIELDS } from '../../src/models/pii.models';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';

test.describe('Aisle facade — bulk read', () => {
  onlyIfInScope('batchReadPii', 'writePii');

  test(
    'AISLE-BR-001 Bulk read lifecycle: save names for two fake users, bulk read one, then both',
    { tag: ['@smoke'] },
    async ({ aisle, data, cleanup }) => {
      const users = [
        { userId: data.userId('br1a'), name: data.name() },
        { userId: data.userId('br1b'), name: data.name() },
      ];
      for (const u of users)
        await seedField(aisle, cleanup, { userId: u.userId, field: PII_FIELDS.NAME, value: u.name });
      const [userA] = users as [{ userId: string; name: string }];

      const one = expectSuccess(
        await aisle.batchRead({ user_ids: [userA.userId], fields: [PII_FIELDS.NAME] }),
        200,
        batchReadDataSchema,
        'PII batch read successful',
      );
      expect(one.count).toBe(1);
      expect(one.items[0]).toMatchObject({
        tenant_id: AISLE_TENANT,
        user_id: userA.userId,
        field: PII_FIELDS.NAME,
      });
      expectSecretEquals(one.items[0]?.value, userA.name, 'bulk-read NAME (user A only)');

      const res = await aisle.batchRead({ user_ids: users.map((u) => u.userId), fields: [PII_FIELDS.NAME] });
      const bulk = expectSuccess(res, 200, batchReadDataSchema, 'PII batch read successful');
      expect(bulk.tenant_id).toBe(AISLE_TENANT);
      expect(bulk.count).toBe(2);
      expect(bulk.items).toHaveLength(2);
      for (const u of users) {
        const item = bulk.items.find((i) => i.user_id === u.userId);
        expect(item, 'each fake user has an item').toBeDefined();
        expect(item).toMatchObject({ tenant_id: AISLE_TENANT, field: PII_FIELDS.NAME });
        expectSecretEquals(item?.value, u.name, 'bulk-read NAME');
      }
    },
  );

  test('AISLE-BR-002 A bulk read fails as a whole (404) if one user has none of the requested fields', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const saved = data.userId('br2-saved');
    await seedField(aisle, cleanup, { userId: saved, field: PII_FIELDS.NAME, value: data.name() });

    const res = await aisle.batchRead({
      user_ids: [saved, data.userId('br2-never-saved')],
      fields: [PII_FIELDS.NAME],
    });
    const error = expectError(res, 404, ERROR_CODES.PII_NOT_FOUND);
    expect(error.data).toBeNull();
  });

  test('AISLE-BR-003 Bulk reads with an empty user list or more than 200 users are rejected (422)', async ({
    aisle,
    data,
  }) => {
    noteAssumption(
      'BQ-18',
      'the exact maximum is pending: 200 users returned 403 on staging, so it is not asserted',
    );
    const empty = await aisle.call('batchReadPii', { user_ids: [], fields: [PII_FIELDS.NAME] });
    expectValidationError(empty, 'user_ids');

    const tooMany = await aisle.call('batchReadPii', {
      user_ids: data.userIds(LIMITS.batchUserIds.max + 1, 'br3'),
      fields: [PII_FIELDS.NAME],
    });
    expectValidationError(tooMany, 'user_ids');
  });

  test('AISLE-BR-004 Bulk read with the same user ID twice returns only that user’s saved name', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('br4');
    const name = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });

    const res = await aisle.batchRead({ user_ids: [userId, userId], fields: [PII_FIELDS.NAME] });
    const bulk = expectSuccess(res, 200, batchReadDataSchema, 'PII batch read successful');
    expect(bulk.items.length).toBeGreaterThanOrEqual(1);
    for (const item of bulk.items) {
      expect(item).toMatchObject({ tenant_id: AISLE_TENANT, user_id: userId, field: PII_FIELDS.NAME });
      expectSecretEquals(item.value, name, 'bulk-read NAME');
    }
    // De-duplication is deliberately NOT asserted either way (BQ-19); the observed count is recorded.
    noteAssumption('BQ-19', `duplicate user ID returned count=${bulk.count} (observed 2 on 2026-09-29)`);
  });

  test('AISLE-BR-005 Bulk reads missing the user list or the field list are rejected (422)', async ({
    aisle,
    data,
  }) => {
    noteAssumption(
      'BQ-09',
      'missing user_ids/fields → 422 inferred from read/write behaviour; verify on staging',
    );
    const noUsers = await aisle.call('batchReadPii', { fields: [PII_FIELDS.NAME] });
    expectValidationError(noUsers, 'user_ids');

    const noFields = await aisle.call('batchReadPii', { user_ids: [data.userId('br5')] });
    expectValidationError(noFields, 'fields');
  });

  test('AISLE-BR-006 Bulk read of an unknown field name is refused (403 AUTHORIZATION_DENIED)', async ({
    aisle,
    data,
    config,
  }) => {
    noteAssumption(
      'BQ-12',
      'expected 403 like read/write of an unknown field (BQ-27); not yet observed for bulk read — verify on staging',
    );
    const res = await aisle.batchRead({
      user_ids: [data.userId('br6')],
      fields: [config.testData.unsupportedField],
    });
    expectError(res, 403, ERROR_CODES.AUTHORIZATION_DENIED);
  });
});
