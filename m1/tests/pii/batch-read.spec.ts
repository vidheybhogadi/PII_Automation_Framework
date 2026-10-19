/** Bulk read — POST /api/v1/pii-test/batch/read through the Aisle facade (observed behaviour). */
import {
  expectError,
  expectNoData,
  expectSuccess,
  expectValidationError,
} from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
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
import { batchReadDataSchema, LIMITS, PII_FIELDS } from '../../src/models/pii.models';

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
      );
      expect(one.count).toBe(1);
      expect(one.items[0]).toMatchObject({
        user_id: userA.userId,
        field: PII_FIELDS.NAME,
      });
      expectSecretEquals(one.items[0]?.value, userA.name, 'bulk-read NAME (user A only)');

      const res = await aisle.batchRead({ user_ids: users.map((u) => u.userId), fields: [PII_FIELDS.NAME] });
      const bulk = expectSuccess(res, 200, batchReadDataSchema);
      expect(bulk.count).toBe(2);
      expect(bulk.items).toHaveLength(2);
      for (const u of users) {
        const item = bulk.items.find((i) => i.user_id === u.userId);
        expect(item, 'each fake user has an item').toBeDefined();
        expect(item).toMatchObject({ field: PII_FIELDS.NAME });
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
      'the exact maximum is open: 200 users returned 403 on staging, so it is not asserted',
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
    const bulk = expectSuccess(res, 200, batchReadDataSchema);
    expect(bulk.items.length).toBeGreaterThanOrEqual(1);
    for (const item of bulk.items) {
      expect(item).toMatchObject({ user_id: userId, field: PII_FIELDS.NAME });
      expectSecretEquals(item.value, name, 'bulk-read NAME');
    }
    // De-duplication is deliberately NOT asserted either way; the observed count is recorded.
    noteObserved('2026-09-29', `duplicate user ID returned count=${bulk.count} (2 on 2026-09-29)`);
  });

  test('AISLE-BR-006 Bulk read of an unknown field name is refused (403 AUTHORIZATION_DENIED)', async ({
    aisle,
    data,
    config,
  }) => {
    noteObserved('2026-10-01', 'an unknown field name on bulk read → 403 AUTHORIZATION_DENIED');
    const res = await aisle.batchRead({
      user_ids: [data.userId('br6')],
      fields: [config.testData.unsupportedField],
    });
    expectError(res, 403, ERROR_CODES.AUTHORIZATION_DENIED);
  });

  test('AISLE-BR-007 A bulk read asking for a known field together with an unknown one is refused as a whole (403) and returns no data', async ({
    aisle,
    data,
    cleanup,
    config,
  }) => {
    noteObserved(
      '2026-10-01',
      'fields ["NAME", <unknown>] → 403 AUTHORIZATION_DENIED for the whole bulk read',
    );
    const userId = data.userId('br7');
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: data.name() });
    const res = await aisle.batchRead({
      user_ids: [userId],
      fields: [PII_FIELDS.NAME, config.testData.unsupportedField],
    });
    expectError(res, 403, ERROR_CODES.AUTHORIZATION_DENIED);
    expectNoData(res);
  });

  test('AISLE-BR-008 A bulk read asking for the same field twice returns it twice (count 2)', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'fields ["NAME","NAME"] → 200 with the item twice (no de-duplication)');
    const userId = data.userId('br8');
    const name = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });
    const bulk = expectSuccess(
      await aisle.batchRead({ user_ids: [userId], fields: [PII_FIELDS.NAME, PII_FIELDS.NAME] }),
      200,
      batchReadDataSchema,
    );
    expect(bulk.count).toBe(2);
    for (const item of bulk.items) expectSecretEquals(item.value, name, 'duplicated NAME item');
  });

  test('AISLE-BR-009 Empty or null entries in a bulk read are refused: an empty field list or a null entry (422), an empty user ID (404)', async ({
    aisle,
    data,
  }) => {
    noteAssumption(
      'BQ-38',
      'observed 2026-10-01: user_ids [""] → 404 PII_NOT_FOUND (not a 422 format error, unlike the single read); Dev to confirm',
    );
    const userId = data.userId('br9');
    expectValidationError(await aisle.call('batchReadPii', { user_ids: [userId], fields: [] }), 'fields');
    expectValidationError(
      await aisle.call('batchReadPii', { user_ids: [userId], fields: [null] }),
      'fields.0',
    );
    expectValidationError(
      await aisle.call('batchReadPii', { user_ids: [null], fields: [PII_FIELDS.NAME] }),
      'user_ids.0',
    );
    const emptyUser = await aisle.call('batchReadPii', { user_ids: [''], fields: [PII_FIELDS.NAME] });
    expectError(emptyUser, 404, ERROR_CODES.PII_NOT_FOUND);
    expectNoData(emptyUser);
  });

  test('AISLE-BR-010 Bulk reading the emails of three fake users returns each user’s own email', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'bulk EMAIL read for 3 users → 200, count 3');
    const users = [1, 2, 3].map((i) => ({ userId: data.userId(`br10${i}`), email: data.email(`br10${i}`) }));
    for (const u of users)
      await seedField(aisle, cleanup, {
        userId: u.userId,
        field: PII_FIELDS.EMAIL,
        value: u.email,
        blocker: BLOCKERS.email,
      });

    const res = await aisle.batchRead({ user_ids: users.map((u) => u.userId), fields: [PII_FIELDS.EMAIL] });
    blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
    const bulk = expectSuccess(res, 200, batchReadDataSchema);
    expect(bulk.count).toBe(3);
    for (const u of users) {
      const item = bulk.items.find((i) => i.user_id === u.userId);
      expect(item?.field).toBe(PII_FIELDS.EMAIL);
      expectSecretEquals(item?.value, u.email, 'bulk-read EMAIL');
    }
  });

  test('AISLE-BR-011 Bulk read of NAME and EMAIL for one user with only a name and one with only an email returns what each has (count 2)', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption(
      'BQ-42',
      'observed 2026-10-01: missing fields are skipped when each user has at least one requested field (200), but a user with none of them fails the whole read (404, AISLE-BR-002)',
    );
    const nameOnly = { userId: data.userId('br11n'), value: data.name() };
    const emailOnly = { userId: data.userId('br11e'), value: data.email('br11') };
    await seedField(aisle, cleanup, {
      userId: nameOnly.userId,
      field: PII_FIELDS.NAME,
      value: nameOnly.value,
    });
    await seedField(aisle, cleanup, {
      userId: emailOnly.userId,
      field: PII_FIELDS.EMAIL,
      value: emailOnly.value,
      blocker: BLOCKERS.email,
    });

    const bulk = expectSuccess(
      await aisle.batchRead({
        user_ids: [nameOnly.userId, emailOnly.userId],
        fields: [PII_FIELDS.NAME, PII_FIELDS.EMAIL],
      }),
      200,
      batchReadDataSchema,
    );
    expect(bulk.count).toBe(2);
    expect(bulk.items.map((i) => `${i.user_id === nameOnly.userId ? 'A' : 'B'}:${i.field}`).sort()).toEqual([
      'A:NAME',
      'B:EMAIL',
    ]);
    expectSecretEquals(
      bulk.items.find((i) => i.field === PII_FIELDS.NAME)?.value,
      nameOnly.value,
      'NAME of user A',
    );
    expectSecretEquals(
      bulk.items.find((i) => i.field === PII_FIELDS.EMAIL)?.value,
      emailOnly.value,
      'EMAIL of user B',
    );
  });

  test('AISLE-BR-012 Bulk read results come back in the same order as the requested user IDs', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'items follow the order of user_ids in the request');
    const users = [data.userId('br12a'), data.userId('br12b'), data.userId('br12c')];
    for (const userId of users)
      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: data.name() });

    for (const order of [
      [users[2], users[0], users[1]],
      [users[1], users[2], users[0]],
    ] as string[][]) {
      const bulk = expectSuccess(
        await aisle.batchRead({ user_ids: order, fields: [PII_FIELDS.NAME] }),
        200,
        batchReadDataSchema,
      );
      expect(bulk.items.map((i) => i.user_id)).toEqual(order);
    }
  });

  test('AISLE-BR-013 A bulk read of 199 users works, and exactly 200 users (the stated maximum) works too', async () => {
    blockedBy(
      'BQ-18',
      'exactly 200 users returned 403 on staging (2026-09-29); the real maximum must be confirmed before 200 records are created',
    );
  });
});
