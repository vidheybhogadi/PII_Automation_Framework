/** Guide §5 — POST /api/v1/pii/batch/read (Cartesian product of user_ids × fields). */
import {
  expectError,
  expectRejected,
  expectRequestValidationError,
  expectSuccess,
} from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import type { PiiClient } from '../../src/clients/pii-client';
import type { CleanupRegistry } from '../../src/utils/cleanup';
import type { TestDataFactory } from '../../src/data/test-data-factory';
import { seedField, seedUser } from '../../src/fixtures/steps';
import { expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { LIMITS, batchReadDataSchema } from '../../src/models/pii.models';

/** Seed `count` users with an EMAIL each, in small parallel chunks to avoid hammering the service. */
async function seedEmailUsers(
  pii: PiiClient,
  cleanup: CleanupRegistry,
  data: TestDataFactory,
  tenant: string,
  count: number,
): Promise<string[]> {
  const users = data.userIds(count, 'br');
  for (let i = 0; i < users.length; i += 10) {
    await Promise.all(
      users
        .slice(i, i + 10)
        .map((userId) =>
          seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: data.email('br') }),
        ),
    );
  }
  return users;
}

const pairKey = (i: { user_id: string; field: string }) => `${i.user_id}|${i.field}`;

test.describe('PII batch read', { tag: ['@regression'] }, () => {
  onlyIfInScope('writePii', 'batchReadPii');

  test(
    'PII-BR-001 Bulk read of 2 users × 2 fields returns all 4 values',
    { tag: '@smoke' },
    async ({ pii, data, tenant, cleanup }) => {
      const [u1, u2] = data.userIds(2, 'br1') as [string, string];
      const values: Record<string, string> = {
        [`${u1}|EMAIL`]: data.email(),
        [`${u1}|NAME`]: data.name(),
        [`${u2}|EMAIL`]: data.email(),
        [`${u2}|NAME`]: data.name(),
      };
      await seedUser(pii, cleanup, tenant, u1, {
        EMAIL: values[`${u1}|EMAIL`]!,
        NAME: values[`${u1}|NAME`]!,
      });
      await seedUser(pii, cleanup, tenant, u2, {
        EMAIL: values[`${u2}|EMAIL`]!,
        NAME: values[`${u2}|NAME`]!,
      });

      const result = expectSuccess(
        await pii.batchReadPii({ tenant_id: tenant, user_ids: [u1, u2], fields: ['EMAIL', 'NAME'] }),
        200,
        batchReadDataSchema,
        'PII batch read successful',
      );
      expect(result.tenant_id).toBe(tenant);
      expect(result.count).toBe(4);
      expect(result.items.map(pairKey).sort()).toEqual(Object.keys(values).sort());
      for (const item of result.items) {
        expect(item.tenant_id).toBe(tenant);
        expectSecretEquals(item.value, values[pairKey(item)]!, pairKey(item).split('|')[1]!);
      }
    },
  );

  test('PII-BR-002 Bulk read leaves out fields a user does not have', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const [u1, u2] = data.userIds(2, 'br2') as [string, string];
    await seedUser(pii, cleanup, tenant, u1, { EMAIL: data.email(), NAME: data.name() });
    await seedUser(pii, cleanup, tenant, u2, { EMAIL: data.email() });
    const result = expectSuccess(
      await pii.batchReadPii({ tenant_id: tenant, user_ids: [u1, u2], fields: ['EMAIL', 'NAME'] }),
      200,
      batchReadDataSchema,
    );
    expect(result.count).toBe(3);
    expect(result.items.map(pairKey).sort()).toEqual([`${u1}|EMAIL`, `${u1}|NAME`, `${u2}|EMAIL`].sort());
  });

  test('PII-BR-003 The whole bulk read fails (404) if one user has none of the requested fields', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const [withData, withoutData] = data.userIds(2, 'br3') as [string, string];
    await seedUser(pii, cleanup, tenant, withData, { EMAIL: data.email() });
    expectError(
      await pii.batchReadPii({ tenant_id: tenant, user_ids: [withData, withoutData], fields: ['EMAIL'] }),
      404,
      ERROR_CODES.PII_NOT_FOUND,
    );
  });

  test('PII-BR-004 A bulk read of exactly the maximum size (users × fields) is accepted', async ({
    pii,
    data,
    tenant,
    cleanup,
    config,
  }) => {
    const max = config.limits.batchMaxItems;
    test.skip(
      max > LIMITS.batchUserIds.max,
      `batchMaxItems ${max} exceeds user_ids max ${LIMITS.batchUserIds.max}; adjust test`,
    );
    test.setTimeout(120_000);
    const users = await seedEmailUsers(pii, cleanup, data, tenant, max);
    const result = expectSuccess(
      await pii.batchReadPii({ tenant_id: tenant, user_ids: users, fields: ['EMAIL'] }),
      200,
      batchReadDataSchema,
    );
    expect(result.count).toBe(max);
  });

  test('PII-BR-005 A bulk read one item over the maximum size is rejected', async ({
    pii,
    data,
    tenant,
    cleanup,
    config,
  }) => {
    const max = config.limits.batchMaxItems;
    test.skip(
      max + 1 > LIMITS.batchUserIds.max,
      `batchMaxItems+1 exceeds user_ids max ${LIMITS.batchUserIds.max}`,
    );
    test.setTimeout(120_000);
    noteAssumption('Q-19', 'Status for exceeding batch_max_items is undocumented; 400/413/422 accepted.');
    // All users exist, so a rejection can only be due to the item limit (not to 404 for missing users).
    const users = await seedEmailUsers(pii, cleanup, data, tenant, max + 1);
    expectRejected(
      await pii.batchReadPii({ tenant_id: tenant, user_ids: users, fields: ['EMAIL'] }),
      [400, 413, 422],
      'Q-19',
    );
  });

  test('PII-BR-006 Repeated user IDs or fields in a bulk read are returned only once', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    noteAssumption(
      'Q-20',
      'Whether duplicates count toward batch_max_items is undocumented; only de-dup of results is asserted.',
    );
    const userId = data.userId('br6');
    await seedUser(pii, cleanup, tenant, userId, { EMAIL: data.email() });
    const result = expectSuccess(
      await pii.batchReadPii({ tenant_id: tenant, user_ids: [userId, userId], fields: ['EMAIL', 'EMAIL'] }),
      200,
      batchReadDataSchema,
    );
    expect(result.count).toBe(1);
    expect(result.items.map(pairKey)).toEqual([`${userId}|EMAIL`]);
  });

  test('PII-BR-007 Bulk reads over the request limits (too many users or fields) are rejected', async ({
    pii,
    tenant,
    data,
  }) => {
    await test.step('empty user_ids -> 422', async () => {
      expectRequestValidationError(
        await pii.batchReadPii({ tenant_id: tenant, user_ids: [], fields: ['EMAIL'] }),
      );
    });
    await test.step('empty fields -> 422', async () => {
      expectRequestValidationError(
        await pii.batchReadPii({ tenant_id: tenant, user_ids: [data.userId('br7')], fields: [] }),
      );
    });
    await test.step('201 user_ids (above 200) -> rejected', async () => {
      const users = Array.from({ length: LIMITS.batchUserIds.max + 1 }, (_, i) => `${data.runId}-br7-${i}`);
      expectRejected(
        await pii.batchReadPii({ tenant_id: tenant, user_ids: users, fields: ['EMAIL'] }),
        [400, 413, 422],
        'Q-19',
      );
    });
    await test.step('65 fields (above 64) -> rejected', async () => {
      const fields = Array.from({ length: LIMITS.batchFields.max + 1 }, (_, i) => `F${i}`);
      expectRejected(
        await pii.batchReadPii({ tenant_id: tenant, user_ids: [data.userId('br7')], fields }),
        [400, 413, 422],
        'Q-19',
      );
    });
  });
});
