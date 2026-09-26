/**
 * Guide "Tenant and user identity": a user is (tenant_id, user_id); the same user_id in two tenants is two
 * separate identities. (Transient and free-text cross-tenant cases are in their own specs: TR-004, FT-006.)
 */
import { expectError, expectSuccess } from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { seedField } from '../../src/fixtures/steps';
import { expect, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { readPiiDataSchema, searchIdsOnlyDataSchema } from '../../src/models/pii.models';

test.describe('Tenant isolation', { tag: ['@security', '@regression'] }, () => {
  onlyIfInScope('writePii', 'readPii', 'searchPii', 'batchReadPii');

  test(
    'PII-TI-001 The same user ID in two tenants keeps two independent values',
    { tag: '@smoke' },
    async ({ pii, data, tenant, cleanup }) => {
      const otherTenant = data.secondaryTenant();
      const userId = data.userId('ti1');
      const emailA = data.email('a');
      const emailB = data.email('b');
      await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: emailA });
      await seedField(pii, cleanup, { tenant: otherTenant, userId, field: 'EMAIL', value: emailB });

      const readA = expectSuccess(
        await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL'] }),
        200,
        readPiiDataSchema,
      );
      const readB = expectSuccess(
        await pii.readPii({ tenant_id: otherTenant, user_id: userId, field_names: ['EMAIL'] }),
        200,
        readPiiDataSchema,
      );
      expect(readA.items[0]?.tenant_id).toBe(tenant);
      expect(readB.items[0]?.tenant_id).toBe(otherTenant);
      expectSecretEquals(readA.items[0]?.value, emailA, 'tenant A EMAIL');
      expectSecretEquals(readB.items[0]?.value, emailB, 'tenant B EMAIL');
    },
  );

  test('PII-TI-002 Data saved in tenant A cannot be read through tenant B (404)', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('ti2');
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: data.email() });
    expectError(
      await pii.readPii({ tenant_id: data.secondaryTenant(), user_id: userId, field_names: ['EMAIL'] }),
      404,
      ERROR_CODES.PII_NOT_FOUND,
    );
  });

  test('PII-TI-003 Search only looks inside the requested tenant', async ({ pii, data, tenant, cleanup }) => {
    const otherTenant = data.secondaryTenant();
    const email = data.email('shared');
    const userA = data.userId('ti3a');
    const userB = data.userId('ti3b');
    await seedField(pii, cleanup, { tenant, userId: userA, field: 'EMAIL', value: email });
    await seedField(pii, cleanup, { tenant: otherTenant, userId: userB, field: 'EMAIL', value: email });
    const result = expectSuccess(
      await pii.searchPii('EMAIL', { tenant_id: tenant, value: email }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(result.tenant_id).toBe(tenant);
    expect(result.matches).toEqual([{ user_id: userA }]);
  });

  test('PII-TI-004 A bulk read in tenant B cannot see tenant A’s users (404)', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('ti4');
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: data.email() });
    expectError(
      await pii.batchReadPii({ tenant_id: data.secondaryTenant(), user_ids: [userId], fields: ['EMAIL'] }),
      404,
      ERROR_CODES.PII_NOT_FOUND,
    );
  });

  test('PII-TI-005 Changing a value in tenant A does not change it in tenant B', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const otherTenant = data.secondaryTenant();
    const userId = data.userId('ti5');
    const emailB = data.email('b');
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: data.email('a1') });
    await seedField(pii, cleanup, { tenant: otherTenant, userId, field: 'EMAIL', value: emailB });
    await pii.writePii({ tenant_id: tenant, user_id: userId, field: 'EMAIL', value: data.email('a2') });
    const readB = expectSuccess(
      await pii.readPii({ tenant_id: otherTenant, user_id: userId, field_names: ['EMAIL'] }),
      200,
      readPiiDataSchema,
    );
    expectSecretEquals(readB.items[0]?.value, emailB, 'tenant B EMAIL after tenant A update');
  });

  test('PII-TI-006 A different caller with read permission can read data in the same tenant (as documented)', async ({
    pii,
    piiAs,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('ti6');
    const email = data.email();
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email });
    const read = expectSuccess(
      await piiAs('secondary').readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL'] }),
      200,
      readPiiDataSchema,
    );
    expectSecretEquals(read.items[0]?.value, email, 'cross-caller EMAIL');
  });
});
