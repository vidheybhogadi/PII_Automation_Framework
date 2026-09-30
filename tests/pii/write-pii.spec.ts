/**
 * Save PII — POST /api/v1/pii-test through the Aisle facade.
 * Expected results are OBSERVED on staging (docs/backend-open-questions.md). NAME is used because it is the
 * field the Aisle caller can access today; EMAIL cases are gated at runtime (BQ-01).
 */
import {
  expectError,
  expectStatus,
  expectSuccess,
  expectValidationError,
} from '../../src/assertions/response.assertions';
import { expectResponseDoesNotEcho, expectSecretEquals } from '../../src/assertions/security.assertions';
import { messyEmail } from '../../src/data/test-data-factory';
import { BLOCKERS, expectNotPersisted, readValue, seedField } from '../../src/fixtures/steps';
import {
  blockIfAccessDenied,
  expect,
  noteAssumption,
  onlyIfInScope,
  test,
} from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import {
  batchReadDataSchema,
  LIMITS,
  PII_FIELDS,
  readPiiDataSchema,
  writePiiDataSchema,
} from '../../src/models/pii.models';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';

test.describe('Aisle facade — save PII', () => {
  onlyIfInScope('writePii', 'readPii');

  test(
    'AISLE-WR-001 Saving a name for a brand-new fake user returns 201 with the saved field details',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('wr1');
      const name = data.name();

      const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: name });
      cleanup.leaveBehind('PII NAME', userId);

      const saved = expectSuccess(res, 201, writePiiDataSchema, 'PII write successful');
      expect(saved).toMatchObject({ tenant_id: AISLE_TENANT, user_id: userId, field: PII_FIELDS.NAME });
      expect(saved.key_version).toBeGreaterThanOrEqual(1);
      expectResponseDoesNotEcho(res, name);
    },
  );

  test(
    'AISLE-WR-002 Full name lifecycle: save, read, replace (200), read the new name, bulk read the new name',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('wr2');
      const nameA = data.name();
      const nameB = data.name();

      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: nameA });
      expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.NAME }), nameA, 'read NAME A');

      const replace = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: nameB });
      const saved = expectSuccess(replace, 200, writePiiDataSchema, 'PII write successful');
      expect(saved).toMatchObject({ tenant_id: AISLE_TENANT, user_id: userId, field: PII_FIELDS.NAME });

      expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.NAME }), nameB, 'read NAME B');

      const bulk = expectSuccess(
        await aisle.batchRead({ user_ids: [userId], fields: [PII_FIELDS.NAME] }),
        200,
        batchReadDataSchema,
      );
      expect(bulk.count).toBe(1);
      expect(bulk.items[0]?.user_id).toBe(userId);
      expectSecretEquals(bulk.items[0]?.value, nameB, 'bulk-read NAME B');
    },
  );

  test('AISLE-WR-003 Save requests with a missing or wrong-typed field are rejected (422) and the saved name stays the same', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('wr3');
    const original = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: original });

    const noValue = await aisle.call('writePii', { user_id: userId, field: PII_FIELDS.NAME });
    expectValidationError(noValue, 'value');

    const noUser = await aisle.call('writePii', { field: PII_FIELDS.NAME, value: data.name() });
    expectValidationError(noUser, 'user_id');

    const numberValue = await aisle.call('writePii', {
      user_id: userId,
      field: PII_FIELDS.NAME,
      value: 12345,
    });
    expectValidationError(numberValue, 'value');

    const noField = await aisle.call('writePii', { user_id: userId, value: data.name() });
    expectValidationError(noField, 'field');

    const numberUser = await aisle.call('writePii', {
      user_id: 12345,
      field: PII_FIELDS.NAME,
      value: data.name(),
    });
    expectValidationError(numberUser, 'user_id');

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      original,
      'NAME unchanged',
    );
  });

  test('AISLE-WR-004 Saving an empty value is rejected (422)', async ({ aisle, data, cleanup }) => {
    const userId = data.userId('wr4');
    const original = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: original });

    const res = await aisle.call('writePii', { user_id: userId, field: PII_FIELDS.NAME, value: '' });
    expectValidationError(res, 'value');

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      original,
      'NAME unchanged',
    );
  });

  test('AISLE-WR-005 Values exactly at the maximum length are accepted (user ID 128 characters, name 1,024 characters)', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-05', 'limits observed on staging (user ID 128, value 1,024) — to be confirmed by Dev');
    const userId = data.userIdOfLength(LIMITS.userId.max);
    const longName = data.textOfLength(LIMITS.value.max);
    expect(userId).toHaveLength(LIMITS.userId.max);
    expect(longName).toHaveLength(LIMITS.value.max);

    const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: longName });
    cleanup.leaveBehind('PII NAME', userId);
    expectSuccess(res, 201, writePiiDataSchema, 'PII write successful');

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      longName,
      'max-length NAME',
    );
  });

  test('AISLE-WR-006 Values one character over the maximum are rejected (422) and nothing changes', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-05', 'limits observed on staging (user ID 128, value 1,024) — to be confirmed by Dev');
    const userId = data.userId('wr6');
    const original = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: original });

    const longUser = await aisle.call('writePii', {
      user_id: data.userIdOfLength(LIMITS.userId.max + 1),
      field: PII_FIELDS.NAME,
      value: data.name(),
    });
    expectValidationError(longUser, 'user_id');

    const longValue = await aisle.call('writePii', {
      user_id: userId,
      field: PII_FIELDS.NAME,
      value: data.textOfLength(LIMITS.value.max + 1),
    });
    expectValidationError(longValue, 'value');

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      original,
      'NAME unchanged',
    );
  });

  test('AISLE-WR-007 A request body that is not valid JSON is rejected (400 “Invalid JSON”)', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('wr7');
    const original = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: original });

    // Broken JSON (no value and no closing brace). Contains no personal data.
    const broken = Buffer.from(`{"user_id": "${userId}", "field": "NAME", "value": `, 'utf8');
    const res = await aisle.call('writePii', undefined, { tamper: { bodyBytes: broken } });
    expectStatus(res, 400);
    expect(res.json()).toMatchObject({
      status: false,
      error: 'Invalid JSON',
      message: 'Request body must be valid JSON',
    });

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      original,
      'NAME unchanged',
    );
  });

  test('AISLE-WR-008 Saving an unknown field name is refused (403 AUTHORIZATION_DENIED)', async ({
    aisle,
    data,
    config,
  }) => {
    noteAssumption(
      'BQ-12',
      'observed 403 for an unknown field; whether it should be a validation error is Dev’s call',
    );
    const res = await aisle.call('writePii', {
      user_id: data.userId('wr8'),
      field: config.testData.unsupportedField,
      value: data.name(),
    });
    expectError(res, 403, ERROR_CODES.AUTHORIZATION_DENIED);
  });

  test('AISLE-WR-009 An email without “@” is rejected and nothing is saved', async ({ aisle, data }) => {
    const userId = data.userId('wr9');
    const notAnEmail = data.email('wr9').replace('@', '.at.');

    const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: notAnEmail });
    blockIfAccessDenied(
      res,
      BLOCKERS.email.id,
      `${BLOCKERS.email.reason} (permission is checked first, BQ-14)`,
    );
    noteAssumption(
      'BQ-01',
      'expected 400 VALIDATION_ERROR for an email without "@" — to be confirmed by Dev',
    );
    expectStatus(res, [400, 422], 'invalid email rejected');
    await expectNotPersisted(aisle, { userId, field: PII_FIELDS.EMAIL });
  });

  test('AISLE-WR-010 Saving a fake email and reading it back returns it cleaned up', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('wr10');
    const email = data.email('wr10');
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: messyEmail(email),
      blocker: BLOCKERS.email,
    });

    const res = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.EMAIL] });
    blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
    noteAssumption('BQ-01', 'expected EMAIL normalization trim + lower-case — to be confirmed by Dev');
    const read = expectSuccess(res, 200, readPiiDataSchema, 'PII read successful');
    expect(read.count).toBe(1);
    expect(read.items[0]).toMatchObject({
      tenant_id: AISLE_TENANT,
      user_id: userId,
      field: PII_FIELDS.EMAIL,
    });
    expectSecretEquals(read.items[0]?.value, email, 'cleaned-up EMAIL');
  });
});
