/**
 * Guide §4 — POST /api/v1/pii/{field}/search.
 * Emails are unique per test, so EXACT counts are asserted for email searches. Phone numbers come from a
 * small shared approved list, so phone searches assert INCLUSION of our users rather than exact counts.
 */
import {
  expectError,
  expectRejected,
  expectRequestValidationError,
  expectSuccess,
} from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { formattedPhone, messyEmail } from '../../src/data/test-data-factory';
import { seedField } from '../../src/fixtures/steps';
import { blockedBy, expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { LIMITS, searchIdsOnlyDataSchema, searchWithValuesDataSchema } from '../../src/models/pii.models';

test.describe('PII search', { tag: ['@regression'] }, () => {
  onlyIfInScope('writePii', 'searchPii');

  test(
    'PII-SR-001 Searching by exact email returns only user IDs, no personal data',
    { tag: '@smoke' },
    async ({ pii, data, tenant, cleanup }) => {
      const userId = data.userId('sr1');
      const email = data.email();
      await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email });

      const res = await pii.searchPii('EMAIL', {
        tenant_id: tenant,
        value: email,
        limit: 10,
        include_values: false,
      });
      // strictObject: a match containing anything but user_id fails validation.
      const result = expectSuccess(res, 200, searchIdsOnlyDataSchema, 'PII search successful');
      expect(result).toMatchObject({ tenant_id: tenant, field: 'EMAIL', count: 1, truncated: false });
      expect(result.matches).toEqual([{ user_id: userId }]);
      expect(
        res.rawText().toLowerCase().includes(email),
        'response body must not contain the searched email',
      ).toBe(false);
    },
  );

  test('PII-SR-002 Search ignores upper/lower case and extra spaces in the value searched for', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('sr2');
    const email = data.email();
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email });
    const result = expectSuccess(
      await pii.searchPii('EMAIL', { tenant_id: tenant, value: messyEmail(email) }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(result.matches).toEqual([{ user_id: userId }]);
  });

  test('PII-SR-003 Searching a formatted phone (with spaces, dashes or brackets) finds the stored digits-only phone', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('sr3');
    const phone = data.phone(0);
    await seedField(pii, cleanup, { tenant, userId, field: 'PHONE', value: phone.normalized });
    const result = expectSuccess(
      await pii.searchPii('PHONE', {
        tenant_id: tenant,
        value: formattedPhone(phone.normalized),
        limit: 100,
      }),
      200,
      searchIdsOnlyDataSchema,
    );
    // Shared approved numbers may match other test users; ours must be included (unless truncated at 100).
    expect(result.truncated || result.matches.some((m) => m.user_id === userId)).toBe(true);
    expect(result.count).toBe(result.matches.length);
  });

  test('PII-SR-004 A search with no match returns an empty result (exact behaviour is open question Q-08)', async ({
    pii,
    data,
    tenant,
  }) => {
    noteAssumption(
      'Q-08',
      'Guide does not define search no-match; accepted: 200 with count 0, or 404 PII_NOT_FOUND.',
    );
    const res = await pii.searchPii('EMAIL', { tenant_id: tenant, value: data.email('nomatch') });
    if (res.status === 404) {
      expectError(res, 404, ERROR_CODES.PII_NOT_FOUND);
    } else {
      const result = expectSuccess(res, 200, searchIdsOnlyDataSchema);
      expect(result).toMatchObject({ count: 0, matches: [], truncated: false });
    }
  });

  test('PII-SR-005 All users sharing the same email are returned', async ({ pii, data, tenant, cleanup }) => {
    const email = data.email('shared');
    const users = data.userIds(3, 'sr5');
    for (const userId of users)
      await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email });
    const result = expectSuccess(
      await pii.searchPii('EMAIL', { tenant_id: tenant, value: email, limit: 10 }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(result.count).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.matches.map((m) => m.user_id).sort()).toEqual([...users].sort());
  });

  test('PII-SR-006 With more matches than the limit, only "limit" results come back, marked truncated', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const email = data.email('trunc');
    const users = data.userIds(3, 'sr6');
    for (const userId of users)
      await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email });
    const result = expectSuccess(
      await pii.searchPii('EMAIL', { tenant_id: tenant, value: email, limit: 2 }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(result).toMatchObject({ count: 2, truncated: true });
    result.matches.forEach((m) => expect(users).toContain(m.user_id));
  });

  test('PII-SR-007 When matches exactly equal the limit, the result is still marked truncated ("reached the limit")', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    noteAssumption(
      'Q-09',
      'Guide: truncated=true when matches REACH the effective limit; asserted literally.',
    );
    const email = data.email('reach');
    for (const userId of data.userIds(2, 'sr7'))
      await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email });
    const result = expectSuccess(
      await pii.searchPii('EMAIL', { tenant_id: tenant, value: email, limit: 2 }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(result).toMatchObject({ count: 2, truncated: true });
  });

  test('PII-SR-008 The default limit is used when no limit is given', async ({
    pii,
    data,
    tenant,
    cleanup,
    config,
  }) => {
    const defaultLimit = config.limits.searchDefaultLimit;
    const email = data.email('deflimit');
    const users = data.userIds(defaultLimit + 1, 'sr8');
    await Promise.all(
      users.map((userId) => seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email })),
    );
    const result = expectSuccess(
      await pii.searchPii('EMAIL', { tenant_id: tenant, value: email }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(result).toMatchObject({ count: defaultLimit, truncated: true });
  });

  test('PII-SR-009 A limit outside 1–100 is rejected (422)', async ({ pii, data, tenant }) => {
    for (const limit of [LIMITS.searchLimit.min - 1, LIMITS.searchLimit.max + 1, -1]) {
      await test.step(`limit=${limit}`, async () => {
        expectRequestValidationError(
          await pii.searchPii('EMAIL', { tenant_id: tenant, value: data.email(), limit }),
        );
      });
    }
  });

  test('PII-SR-010 Asking for values returns tenant, user, field and the cleaned-up value', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('sr10');
    const email = data.email();
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email });
    const result = expectSuccess(
      await pii.searchPii('EMAIL', { tenant_id: tenant, value: messyEmail(email), include_values: true }),
      200,
      searchWithValuesDataSchema,
    );
    expect(result.count).toBe(1);
    expect(result.matches[0]).toMatchObject({ tenant_id: tenant, user_id: userId, field: 'EMAIL' });
    expectSecretEquals(result.matches[0]?.value, email, 'search value');
  });

  test('PII-SR-011 A search request with missing or invalid fields is rejected (422)', async ({
    pii,
    tenant,
  }) => {
    expectRequestValidationError(
      await pii.call('searchPii', { tenant_id: tenant }, { pathParams: { field: 'EMAIL' } }),
    );
    expectRequestValidationError(
      await pii.call('searchPii', { value: 'x@y.z' }, { pathParams: { field: 'EMAIL' } }),
    );
    expectRequestValidationError(
      await pii.call(
        'searchPii',
        { tenant_id: tenant, value: 'x', include_values: 'maybe' },
        { pathParams: { field: 'EMAIL' } },
      ),
    );
  });

  test('PII-SR-012 Searching a field that is not searchable is rejected', async ({ pii, tenant, config }) => {
    const field = config.testData.nonSearchableField;
    if (!field) {
      blockedBy(
        'Q-18',
        'Which catalog fields are NOT searchable is undocumented; set PII_NON_SEARCHABLE_FIELD.',
      );
      return;
    }
    noteAssumption(
      'Q-18',
      'Rejection status for non-searchable field is undocumented; 400/403/404/422 accepted.',
    );
    expectRejected(
      await pii.searchPii(field, { tenant_id: tenant, value: 'x' }),
      [400, 403, 404, 422],
      'Q-18',
    );
  });
});
