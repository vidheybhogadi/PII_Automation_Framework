/** Read PII — POST /api/v1/pii-test/read through the Aisle facade (observed behaviour; EMAIL keeps an access gate). */
import {
  expectError,
  expectNoData,
  expectSuccess,
  expectValidationError,
} from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { BLOCKERS, readValue, seedField } from '../../src/fixtures/steps';
import {
  blockIfAccessDenied,
  expect,
  noteAssumption,
  noteObserved,
  onlyIfInScope,
  test,
} from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { PII_FIELDS, readPiiDataSchema } from '../../src/models/pii.models';

test.describe('Aisle facade — read PII', () => {
  onlyIfInScope('readPii', 'writePii');

  test(
    'AISLE-RD-001 Reading a saved name returns exactly that name',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('rd1');
      const name = data.name();
      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });

      const res = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] });
      const read = expectSuccess(res, 200, readPiiDataSchema);
      expect(read).toMatchObject({ user_id: userId, count: 1 });
      expect(read.items).toHaveLength(1);
      expect(read.items[0]).toMatchObject({
        user_id: userId,
        field: PII_FIELDS.NAME,
      });
      expectSecretEquals(read.items[0]?.value, name, 'read NAME');
    },
  );

  test('AISLE-RD-002 Asking for a field the user has not saved leaves it out; the saved field is still returned', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('rd2');
    const name = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });

    const res = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME, PII_FIELDS.EMAIL] });
    blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
    noteObserved('2026-10-01', 'fields the user has not saved are left out of the reply');
    const read = expectSuccess(res, 200, readPiiDataSchema);
    expect(read.count).toBe(1);
    expect(read.items.map((i) => i.field)).toEqual([PII_FIELDS.NAME]);
    expectSecretEquals(read.items[0]?.value, name, 'read NAME');
  });

  test('AISLE-RD-003 Reading before any save returns 404 PII_NOT_FOUND; after saving a name, the read returns it', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('rd3');
    const before = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] });
    const error = expectError(before, 404, ERROR_CODES.PII_NOT_FOUND);
    expect(error.message).toBe('PII value not found');

    const name = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });
    expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.NAME }), name, 'NAME after save');
  });

  test('AISLE-RD-004 A read request with an empty field list is rejected (422)', async ({ aisle, data }) => {
    const emptyList = await aisle.call('readPii', { user_id: data.userId('rd4'), field_names: [] });
    expectValidationError(emptyList, 'field_names');
  });

  test('AISLE-RD-005 Reading an unknown field name is refused (403 AUTHORIZATION_DENIED)', async ({
    aisle,
    data,
    config,
  }) => {
    noteObserved('2026-09-29', 'an unknown field name on read → 403 AUTHORIZATION_DENIED');
    const res = await aisle.readPii({
      user_id: data.userId('rd5'),
      field_names: [config.testData.unsupportedField],
    });
    expectError(res, 403, ERROR_CODES.AUTHORIZATION_DENIED);
  });

  test('AISLE-RD-006 Reading a user who has both a name and an email returns both (count 2) with the right values', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'NAME + EMAIL read → 200, count 2');
    const userId = data.userId('rd6');
    const name = data.name();
    const email = data.email('rd6');
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      blocker: BLOCKERS.email,
    });

    const res = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME, PII_FIELDS.EMAIL] });
    const read = expectSuccess(res, 200, readPiiDataSchema);
    expect(read.count).toBe(2);
    expect(read.items.map((i) => i.field).sort()).toEqual([PII_FIELDS.EMAIL, PII_FIELDS.NAME]);
    expectSecretEquals(read.items.find((i) => i.field === PII_FIELDS.NAME)?.value, name, 'NAME');
    expectSecretEquals(read.items.find((i) => i.field === PII_FIELDS.EMAIL)?.value, email, 'EMAIL');
  });

  test('AISLE-RD-007 Asking for a known field together with an unknown one refuses the whole read (403) and returns no data', async ({
    aisle,
    data,
    cleanup,
    config,
  }) => {
    noteObserved('2026-10-01', '["NAME", <unknown>] → 403 AUTHORIZATION_DENIED for the whole read');
    const userId = data.userId('rd7');
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: data.name() });
    const res = await aisle.readPii({
      user_id: userId,
      field_names: [PII_FIELDS.NAME, config.testData.unsupportedField],
    });
    expectError(res, 403, ERROR_CODES.AUTHORIZATION_DENIED);
    expectNoData(res);
  });

  test('AISLE-RD-008 Asking for the same field twice returns it twice (count 2)', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', '["NAME","NAME"] → 200 with the item twice (no de-duplication)');
    const userId = data.userId('rd8');
    const name = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });
    const read = expectSuccess(
      await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME, PII_FIELDS.NAME] }),
      200,
      readPiiDataSchema,
    );
    expect(read.count).toBe(2);
    for (const item of read.items) expectSecretEquals(item.value, name, 'duplicated NAME item');
  });

  test('AISLE-RD-009 Empty or null entries in a read request are refused: a null field name or an empty user ID (422), an empty field name (403)', async ({
    aisle,
    data,
  }) => {
    noteAssumption(
      'BQ-38',
      'observed 2026-10-01: field_names [""] → 403 (treated as an unknown field), not a 422 format error; Dev to confirm',
    );
    const userId = data.userId('rd9');
    expectValidationError(
      await aisle.call('readPii', { user_id: userId, field_names: [null] }),
      'field_names.0',
    );
    expectValidationError(
      await aisle.call('readPii', { user_id: '', field_names: [PII_FIELDS.NAME] }),
      'user_id',
    );
    const emptyName = await aisle.call('readPii', { user_id: userId, field_names: [''] });
    expectError(emptyName, 403, ERROR_CODES.AUTHORIZATION_DENIED);
    expectNoData(emptyName);
  });
});
