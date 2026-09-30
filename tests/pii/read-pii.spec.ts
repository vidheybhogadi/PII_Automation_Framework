/** Read PII — POST /api/v1/pii-test/read through the Aisle facade (observed behaviour, BQ-01 gate for EMAIL). */
import { expectError, expectSuccess, expectValidationError } from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { BLOCKERS, readValue, seedField } from '../../src/fixtures/steps';
import {
  blockIfAccessDenied,
  expect,
  noteAssumption,
  onlyIfInScope,
  test,
} from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { PII_FIELDS, readPiiDataSchema } from '../../src/models/pii.models';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';

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
      const read = expectSuccess(res, 200, readPiiDataSchema, 'PII read successful');
      expect(read).toMatchObject({ tenant_id: AISLE_TENANT, user_id: userId, count: 1 });
      expect(read.items).toHaveLength(1);
      expect(read.items[0]).toMatchObject({
        tenant_id: AISLE_TENANT,
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
    noteAssumption('BQ-01', 'expected: fields the user has not saved are left out — to be confirmed by Dev');
    const read = expectSuccess(res, 200, readPiiDataSchema, 'PII read successful');
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

  test('AISLE-RD-004 A read request with an empty or missing field list, or without a user ID, is rejected (422)', async ({
    aisle,
    data,
  }) => {
    const emptyList = await aisle.call('readPii', { user_id: data.userId('rd4'), field_names: [] });
    expectValidationError(emptyList, 'field_names');

    const noList = await aisle.call('readPii', { user_id: data.userId('rd4') });
    expectValidationError(noList, 'field_names');

    const noUser = await aisle.call('readPii', { field_names: [PII_FIELDS.NAME] });
    expectValidationError(noUser, 'user_id');
  });

  test('AISLE-RD-005 Reading an unknown field name is refused (403 AUTHORIZATION_DENIED)', async ({
    aisle,
    data,
    config,
  }) => {
    noteAssumption(
      'BQ-12',
      'observed 403 for an unknown field on read (BQ-27 supported fields); whether it should be a validation error is Dev’s call',
    );
    const res = await aisle.readPii({
      user_id: data.userId('rd5'),
      field_names: [config.testData.unsupportedField],
    });
    expectError(res, 403, ERROR_CODES.AUTHORIZATION_DENIED);
  });
});
