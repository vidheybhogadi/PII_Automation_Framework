/** Guide §3 — POST /api/v1/pii/read. */
import {
  expectError,
  expectRequestValidationError,
  expectSuccess,
} from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { seedUser } from '../../src/fixtures/steps';
import { expect, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { readPiiDataSchema } from '../../src/models/pii.models';

test.describe('PII read', { tag: ['@regression'] }, () => {
  onlyIfInScope('writePii', 'readPii');

  test(
    'PII-RD-001 Reading one field of a user returns its value',
    { tag: '@smoke' },
    async ({ pii, data, tenant, cleanup }) => {
      const userId = data.userId('rd1');
      const email = data.email();
      await seedUser(pii, cleanup, tenant, userId, { EMAIL: email });
      const read = expectSuccess(
        await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL'] }),
        200,
        readPiiDataSchema,
        'PII read successful',
      );
      expect(read).toMatchObject({ tenant_id: tenant, user_id: userId, count: 1 });
      expect(read.items[0]).toMatchObject({ tenant_id: tenant, user_id: userId, field: 'EMAIL' });
      expectSecretEquals(read.items[0]?.value, email, 'EMAIL');
    },
  );

  test('PII-RD-002 Reading several fields in one call returns all of them', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('rd2');
    const values = { EMAIL: data.email(), PHONE: data.phone(0).normalized, NAME: data.name() };
    await seedUser(pii, cleanup, tenant, userId, values);
    const read = expectSuccess(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL', 'PHONE', 'NAME'] }),
      200,
      readPiiDataSchema,
    );
    expect(read.count).toBe(3);
    expect(read.items.map((i) => i.field).sort()).toEqual(['EMAIL', 'NAME', 'PHONE']);
    for (const item of read.items)
      expectSecretEquals(item.value, values[item.field as keyof typeof values], item.field);
  });

  test('PII-RD-003 Only the fields asked for are returned', async ({ pii, data, tenant, cleanup }) => {
    const userId = data.userId('rd3');
    await seedUser(pii, cleanup, tenant, userId, { EMAIL: data.email(), NAME: data.name() });
    const read = expectSuccess(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['NAME'] }),
      200,
      readPiiDataSchema,
    );
    expect(read.items.map((i) => i.field)).toEqual(['NAME']);
    expect(read.count).toBe(1);
  });

  test('PII-RD-004 Fields the user does not have are left out when at least one requested field exists', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('rd4');
    await seedUser(pii, cleanup, tenant, userId, { EMAIL: data.email() });
    const read = expectSuccess(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL', 'PHONE', 'NAME'] }),
      200,
      readPiiDataSchema,
    );
    expect(read.items.map((i) => i.field)).toEqual(['EMAIL']);
    expect(read.count).toBe(1);
  });

  test('PII-RD-005 Returns 404 PII_NOT_FOUND when the user has none of the requested fields', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('rd5');
    await seedUser(pii, cleanup, tenant, userId, { EMAIL: data.email() });
    expectError(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['PHONE', 'NAME'] }),
      404,
      ERROR_CODES.PII_NOT_FOUND,
    );
  });

  test('PII-RD-006 Returns 404 PII_NOT_FOUND for a user that does not exist', async ({
    pii,
    data,
    tenant,
  }) => {
    expectError(
      await pii.readPii({ tenant_id: tenant, user_id: data.userId('never-written'), field_names: ['EMAIL'] }),
      404,
      ERROR_CODES.PII_NOT_FOUND,
    );
  });

  test('PII-RD-007 An empty list of fields to read is rejected (422)', async ({ pii, data, tenant }) => {
    expectRequestValidationError(
      await pii.readPii({ tenant_id: tenant, user_id: data.userId('rd7'), field_names: [] }),
    );
  });

  test('PII-RD-008 A read request missing required fields is rejected (422)', async ({
    pii,
    data,
    tenant,
  }) => {
    const full = { tenant_id: tenant, user_id: data.userId('rd8'), field_names: ['EMAIL'] };
    for (const key of Object.keys(full)) {
      await test.step(`without ${key}`, async () => {
        const payload: Record<string, unknown> = { ...full };
        delete payload[key];
        expectRequestValidationError(await pii.call('readPii', payload));
      });
    }
  });

  test('PII-RD-009 The returned count matches the items, and every item belongs to the requested tenant and user', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('rd9');
    await seedUser(pii, cleanup, tenant, userId, { EMAIL: data.email(), NAME: data.name() });
    const read = expectSuccess(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL', 'NAME'] }),
      200,
      readPiiDataSchema,
    );
    expect(read.count).toBe(read.items.length);
    for (const item of read.items) expect(item).toMatchObject({ tenant_id: tenant, user_id: userId });
  });
});
