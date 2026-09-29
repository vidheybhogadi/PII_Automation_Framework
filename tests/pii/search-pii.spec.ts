/**
 * Search PII — POST /api/v1/pii-test/{FIELD}/search through the Aisle facade.
 * Search returns 403 AUTHORIZATION_DENIED today, so every test is gated at runtime (BQ-01) and shows the real
 * response. Response shapes, the "truncated" flag and the limit range are NOT confirmed for the facade yet —
 * each is recorded as an assumption to be confirmed by Dev.
 */
import { expectSuccess, expectValidationError } from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { messyEmail } from '../../src/data/test-data-factory';
import { BLOCKERS, seedField } from '../../src/fixtures/steps';
import {
  block,
  blockIfAccessDenied,
  expect,
  noteAssumption,
  onlyIfInScope,
  test,
} from '../../src/fixtures/test-fixtures';
import { PII_FIELDS, searchIdsOnlyDataSchema, searchWithValuesDataSchema } from '../../src/models/pii.models';

test.describe('Aisle facade — search PII', () => {
  onlyIfInScope('searchPii', 'writePii');

  test('AISLE-SR-001 Searching a saved fake email finds the user and returns only user IDs, not emails', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('sr1');
    const email = data.email('sr1');
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      blocker: BLOCKERS.email,
    });

    const res = await aisle.searchPii(PII_FIELDS.EMAIL, {
      value: messyEmail(email),
      limit: 10,
      include_values: false,
    });
    blockIfAccessDenied(res, BLOCKERS.search.id, BLOCKERS.search.reason);
    noteAssumption(
      'BQ-01',
      'search response shape and case/space-insensitive matching — to be confirmed by Dev',
    );
    // The IDs-only schema is strict: any extra property on a match (e.g. a value) fails validation.
    const found = expectSuccess(res, 200, searchIdsOnlyDataSchema);
    expect(found.matches.map((m) => m.user_id)).toContain(userId);
  });

  test('AISLE-SR-002 Searching with values switched on returns the cleaned-up email', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('sr2');
    const email = data.email('sr2');
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      blocker: BLOCKERS.email,
    });

    const res = await aisle.searchPii(PII_FIELDS.EMAIL, { value: email, limit: 10, include_values: true });
    blockIfAccessDenied(res, BLOCKERS.search.id, BLOCKERS.search.reason);
    noteAssumption(
      'BQ-01',
      'search-with-values response shape and email normalization — to be confirmed by Dev',
    );
    const found = expectSuccess(res, 200, searchWithValuesDataSchema);
    const match = found.matches.find((m) => m.user_id === userId);
    expect(match, 'the fake user is in the search results').toBeDefined();
    expectSecretEquals(match?.value, email, 'searched EMAIL value');
  });

  test('AISLE-SR-003 When more users match than the limit, only that many come back and the result is marked “truncated”', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const email = data.email('sr3');
    for (const userId of [data.userId('sr3a'), data.userId('sr3b')]) {
      await seedField(aisle, cleanup, {
        userId,
        field: PII_FIELDS.EMAIL,
        value: email,
        blocker: BLOCKERS.email,
      });
    }

    const res = await aisle.searchPii(PII_FIELDS.EMAIL, { value: email, limit: 1, include_values: false });
    blockIfAccessDenied(res, BLOCKERS.search.id, BLOCKERS.search.reason);
    noteAssumption(
      'BQ-01',
      'the "truncated" flag meaning (more matches than the limit) — to be confirmed by Dev',
    );
    const found = expectSuccess(res, 200, searchIdsOnlyDataSchema);
    expect(found.matches).toHaveLength(1);
    expect(found.truncated).toBe(true);
  });

  test('AISLE-SR-004 A search limit outside 1–100 is rejected (422)', async ({ aisle, data }) => {
    const value = data.email('sr4');

    noteAssumption(
      'BQ-05',
      'observed on staging: limit 0 → 422 greater_than_equal (ge 1), 101 → 422 less_than_equal (le 100); the shape check runs before the access check (BQ-14)',
    );
    const zero = await aisle.searchPii(PII_FIELDS.EMAIL, { value, limit: 0, include_values: false });
    expectValidationError(zero, 'limit');

    const tooMany = await aisle.searchPii(PII_FIELDS.EMAIL, { value, limit: 101, include_values: false });
    expectValidationError(tooMany, 'limit');
  });

  test('AISLE-SR-005 Searching an email nobody has returns an empty result', async ({ aisle, data }) => {
    const res = await aisle.searchPii(PII_FIELDS.EMAIL, {
      value: data.email('sr5-never-saved'),
      limit: 10,
      include_values: false,
    });
    blockIfAccessDenied(res, BLOCKERS.search.id, BLOCKERS.search.reason);
    block('BQ-13', 'no-match behaviour not confirmed (200 with count 0, or 404)');
  });
});
