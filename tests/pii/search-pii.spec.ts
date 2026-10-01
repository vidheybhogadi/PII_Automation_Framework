/**
 * Search PII — POST /api/v1/pii-test/{FIELD}/search through the Aisle facade.
 * EMAIL search access was granted on 2026-10-01; a 403 would still mark a test BLOCKED at runtime. Expected results
 * are observed on staging; open points are recorded as assumptions with their question ID.
 */
import {
  expectError,
  expectExactKeys,
  expectNoData,
  expectSuccess,
  expectValidationError,
} from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { messyEmail } from '../../src/data/test-data-factory';
import { BLOCKERS, seedField } from '../../src/fixtures/steps';
import {
  blockedBy,
  blockIfAccessDenied,
  expect,
  noteAssumption,
  noteObserved,
  onlyIfInScope,
  test,
} from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import {
  PII_FIELDS,
  SEARCH_DATA_KEYS,
  searchIdsOnlyDataSchema,
  searchWithValuesDataSchema,
} from '../../src/models/pii.models';

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
    noteObserved('2026-10-01', 'search reply shape; matching ignores case and surrounding spaces');
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
    noteObserved('2026-10-01', 'search-with-values reply shape; the email comes back cleaned up');
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
    noteObserved('2026-10-01', '"truncated" is true when more users match than the limit');
    const found = expectSuccess(res, 200, searchIdsOnlyDataSchema);
    expect(found.matches).toHaveLength(1);
    expect(found.truncated).toBe(true);
  });

  test('AISLE-SR-004 A search limit outside 1–100 is rejected (422)', async ({ aisle, data }) => {
    const value = data.email('sr4');

    noteObserved('2026-09-29', 'limit 0 → 422 greater_than_equal (ge 1), 101 → 422 less_than_equal (le 100)');
    const zero = await aisle.searchPii(PII_FIELDS.EMAIL, { value, limit: 0, include_values: false });
    expectValidationError(zero, 'limit');

    const tooMany = await aisle.searchPii(PII_FIELDS.EMAIL, { value, limit: 101, include_values: false });
    expectValidationError(tooMany, 'limit');
  });

  test('AISLE-SR-005 Searching for a fake email nobody has saved returns 200 with an empty list (count 0)', async ({
    aisle,
    data,
  }) => {
    const res = await aisle.searchPii(PII_FIELDS.EMAIL, {
      value: data.email('sr5-never-saved'),
      limit: 10,
      include_values: false,
    });
    blockIfAccessDenied(res, BLOCKERS.search.id, BLOCKERS.search.reason);
    noteObserved('2026-10-01', 'no match → 200, empty matches, count 0, truncated false');
    const found = expectSuccess(res, 200, searchIdsOnlyDataSchema);
    expectExactKeys(found, SEARCH_DATA_KEYS, 'no-match search reply data');
    expect(found.matches, 'no user matches a never-saved email').toEqual([]);
    expect(found.count, 'match count').toBe(0);
    expect(found.truncated, 'truncated flag').toBe(false);
  });

  test('AISLE-SR-006 Wildcard characters (% _ * .*) are taken literally and never find other users', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved(
      '2026-10-01',
      'non-email wildcards → 400 VALIDATION_ERROR; email-shaped wildcard patterns → 200 without the user',
    );
    const userId = data.userId('sr6');
    const email = data.email('sr6');
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      blocker: BLOCKERS.email,
    });
    const [local, domain] = email.split('@') as [string, string];

    for (const value of ['%', '_', '*', '.*', `${local.slice(0, 5)}%`]) {
      const res = await aisle.searchPii(PII_FIELDS.EMAIL, { value, limit: 100, include_values: false });
      blockIfAccessDenied(res, BLOCKERS.search.id, BLOCKERS.search.reason);
      expectError(res, 400, ERROR_CODES.VALIDATION_ERROR);
      expectNoData(res);
    }
    for (const value of [
      `%@${domain}`,
      `${local.slice(0, -1)}_@${domain}`,
      `${local}*@${domain}`,
      `.*@${domain}`,
    ]) {
      const res = await aisle.searchPii(PII_FIELDS.EMAIL, { value, limit: 100, include_values: false });
      const found = expectSuccess(res, 200, searchIdsOnlyDataSchema);
      expect(
        found.matches.map((m) => m.user_id),
        'wildcard pattern must not find the user',
      ).not.toContain(userId);
    }
  });

  test('AISLE-SR-007 Part of an email (only the name part, only the domain, the start or the end) never finds the user', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved(
      '2026-10-01',
      'non-email parts → 400 VALIDATION_ERROR; email-shaped parts → 200 without the user (exact match only)',
    );
    const userId = data.userId('sr7');
    const email = data.email('sr7');
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      blocker: BLOCKERS.email,
    });
    const [local, domain] = email.split('@') as [string, string];

    for (const value of [local, domain, email.slice(0, 10)]) {
      const res = await aisle.searchPii(PII_FIELDS.EMAIL, { value, limit: 100, include_values: false });
      blockIfAccessDenied(res, BLOCKERS.search.id, BLOCKERS.search.reason);
      expectError(res, 400, ERROR_CODES.VALIDATION_ERROR);
    }
    for (const value of [`@${domain}`, email.slice(5)]) {
      const found = expectSuccess(
        await aisle.searchPii(PII_FIELDS.EMAIL, { value, limit: 100, include_values: false }),
        200,
        searchIdsOnlyDataSchema,
      );
      expect(
        found.matches.map((m) => m.user_id),
        'a partial email must not find the user',
      ).not.toContain(userId);
    }
  });

  test('AISLE-SR-008 After a user’s email is replaced, searching the old email no longer finds them and the new email does', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'after replace: old email → 0 matches, new email → the user');
    const userId = data.userId('sr8');
    const oldEmail = data.email('sr8a');
    const newEmail = data.email('sr8b');
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: oldEmail,
      blocker: BLOCKERS.email,
    });
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.EMAIL, value: newEmail });

    const old = await aisle.searchPii(PII_FIELDS.EMAIL, {
      value: oldEmail,
      limit: 10,
      include_values: false,
    });
    blockIfAccessDenied(old, BLOCKERS.search.id, BLOCKERS.search.reason);
    const oldFound = expectSuccess(old, 200, searchIdsOnlyDataSchema);
    expect(
      oldFound.matches.map((m) => m.user_id),
      'old email',
    ).not.toContain(userId);

    const current = expectSuccess(
      await aisle.searchPii(PII_FIELDS.EMAIL, { value: newEmail, limit: 10, include_values: false }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(
      current.matches.map((m) => m.user_id),
      'new email',
    ).toContain(userId);
  });

  test('AISLE-SR-009 An email-looking text saved as a NAME is not found by an EMAIL search', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'EMAIL search only looks at EMAIL values');
    const userId = data.userId('sr9');
    const emailLike = data.email('sr9');
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: emailLike });

    const res = await aisle.searchPii(PII_FIELDS.EMAIL, {
      value: emailLike,
      limit: 10,
      include_values: false,
    });
    blockIfAccessDenied(res, BLOCKERS.search.id, BLOCKERS.search.reason);
    const found = expectSuccess(res, 200, searchIdsOnlyDataSchema);
    expect(found.matches.map((m) => m.user_id)).not.toContain(userId);
  });

  test('AISLE-SR-010 Two users with the same email are both found, each with the correct email when values are switched on', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved(
      '2026-10-01',
      'two users sharing an email → count 2, each match {tenant_id, user_id, field, value}',
    );
    const email = data.email('sr10');
    const users = [data.userId('sr10a'), data.userId('sr10b')];
    for (const userId of users)
      await seedField(aisle, cleanup, {
        userId,
        field: PII_FIELDS.EMAIL,
        value: email,
        blocker: BLOCKERS.email,
      });

    const res = await aisle.searchPii(PII_FIELDS.EMAIL, { value: email, limit: 10, include_values: true });
    blockIfAccessDenied(res, BLOCKERS.search.id, BLOCKERS.search.reason);
    const found = expectSuccess(res, 200, searchWithValuesDataSchema);
    expect(found.count).toBe(2);
    expect(found.truncated).toBe(false);
    expect(found.matches.map((m) => m.user_id).sort()).toEqual([...users].sort());
    for (const match of found.matches) {
      expectExactKeys(match, ['field', 'tenant_id', 'user_id', 'value'], 'search match');
      expectSecretEquals(match.value, email, 'searched EMAIL value');
    }
  });

  test('AISLE-SR-011 The smallest and largest allowed limits (1 and 100) are accepted', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'limit 1 → 1 match of 2; limit 100 → both');
    const email = data.email('sr11');
    for (const userId of [data.userId('sr11a'), data.userId('sr11b')])
      await seedField(aisle, cleanup, {
        userId,
        field: PII_FIELDS.EMAIL,
        value: email,
        blocker: BLOCKERS.email,
      });

    const one = await aisle.searchPii(PII_FIELDS.EMAIL, { value: email, limit: 1, include_values: false });
    blockIfAccessDenied(one, BLOCKERS.search.id, BLOCKERS.search.reason);
    expect(expectSuccess(one, 200, searchIdsOnlyDataSchema).matches).toHaveLength(1);
    const hundred = expectSuccess(
      await aisle.searchPii(PII_FIELDS.EMAIL, { value: email, limit: 100, include_values: false }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(hundred.matches).toHaveLength(2);
  });

  test('AISLE-SR-013 Search settings with the wrong type: a decimal limit is rejected (422); a limit or switch written as text is accepted', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption(
      'BQ-40',
      'observed 2026-10-01: limit 10.5 → 422; limit "10" and 10.0 accepted; include_values "true", "yes" and 1 mean true',
    );
    const userId = data.userId('sr13');
    const email = data.email('sr13');
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      blocker: BLOCKERS.email,
    });
    const search = (body: Record<string, unknown>) =>
      aisle.call('searchPii', { value: email, ...body }, { pathParams: { field: PII_FIELDS.EMAIL } });

    const decimal = await search({ limit: 10.5, include_values: false });
    blockIfAccessDenied(decimal, BLOCKERS.search.id, BLOCKERS.search.reason);
    expectValidationError(decimal, 'limit');

    for (const limit of ['10', 10.0]) {
      const found = expectSuccess(
        await search({ limit, include_values: false }),
        200,
        searchIdsOnlyDataSchema,
      );
      expect(found.matches.map((m) => m.user_id)).toContain(userId);
    }
    for (const includeValues of ['true', 'yes', 1]) {
      const found = expectSuccess(
        await search({ limit: 10, include_values: includeValues }),
        200,
        searchWithValuesDataSchema,
      );
      expectSecretEquals(found.matches.find((m) => m.user_id === userId)?.value, email, 'value returned');
    }
  });

  test('AISLE-SR-014 Searching with an empty, blank or non-email value is refused (422 or 400) and returns no data', async ({
    aisle,
  }) => {
    noteObserved('2026-10-01', 'empty / blank → 422 string_too_short; not an email → 400 VALIDATION_ERROR');
    const search = (body: Record<string, unknown>) =>
      aisle.call('searchPii', body, { pathParams: { field: PII_FIELDS.EMAIL } });

    const empty = await search({ value: '', limit: 10, include_values: false });
    blockIfAccessDenied(empty, BLOCKERS.search.id, BLOCKERS.search.reason);
    expectValidationError(empty, 'value');
    expectValidationError(await search({ value: '   ', limit: 10, include_values: false }), 'value');
    const notEmail = await search({ value: 'qa-auto-not-an-email', limit: 10, include_values: false });
    expectError(notEmail, 400, ERROR_CODES.VALIDATION_ERROR);
    expectNoData(notEmail);
  });

  test('AISLE-SR-015 Search on other fields: NAME search answers, PHONE checks the value is a phone (400), an unknown field is refused (403)', async ({
    aisle,
    data,
    config,
  }) => {
    noteAssumption(
      'BQ-32',
      'observed 2026-10-01: /NAME/search → 200, /PHONE/search with a non-phone value → 400 VALIDATION_ERROR, /<unknown>/search → 403; NAME search is undocumented',
    );
    const body = { value: data.email('sr15-no-match'), limit: 10, include_values: false };

    const name = await aisle.call('searchPii', body, { pathParams: { field: PII_FIELDS.NAME } });
    const nameData = expectSuccess(name, 200, searchIdsOnlyDataSchema);
    expect(nameData.field).toBe(PII_FIELDS.NAME);
    expect(nameData.matches).toEqual([]);

    const phone = await aisle.call('searchPii', body, { pathParams: { field: PII_FIELDS.PHONE } });
    expectError(phone, 400, ERROR_CODES.VALIDATION_ERROR);
    expectNoData(phone);

    const unknown = await aisle.call('searchPii', body, {
      pathParams: { field: config.testData.unsupportedField },
    });
    expectError(unknown, 403, ERROR_CODES.AUTHORIZATION_DENIED);
    expectNoData(unknown);
  });

  test('AISLE-SR-016 When exactly as many users match as the limit, the result is complete and not marked “truncated”', async ({
    aisle,
    data,
    cleanup,
  }) => {
    blockedBy(
      'BQ-41',
      'on 2026-10-01 two matches with limit 2 came back with truncated: true; whether "truncated" means "more exist" is Dev’s answer',
    );
    const email = data.email('sr16');
    for (const userId of [data.userId('sr16a'), data.userId('sr16b')])
      await seedField(aisle, cleanup, {
        userId,
        field: PII_FIELDS.EMAIL,
        value: email,
        blocker: BLOCKERS.email,
      });
    const found = expectSuccess(
      await aisle.searchPii(PII_FIELDS.EMAIL, { value: email, limit: 2, include_values: false }),
      200,
      searchIdsOnlyDataSchema,
    );
    expect(found.count).toBe(2);
    expect(found.truncated).toBe(false);
  });
});
