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
    'AISLE-BR-001 Bulk read of names for two fake users returns both names',
    { tag: ['@smoke'] },
    async ({ aisle, data, cleanup }) => {
      const users = [
        { userId: data.userId('br1a'), name: data.name() },
        { userId: data.userId('br1b'), name: data.name() },
      ];
      for (const u of users)
        await seedField(aisle, cleanup, { userId: u.userId, field: PII_FIELDS.NAME, value: u.name });

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
});
