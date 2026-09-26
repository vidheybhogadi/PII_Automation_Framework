/** Guide §2 — POST /api/v1/pii (upsert). Authorization/authentication cases live in tests/security. */
import {
  expectError,
  expectRejected,
  expectRequestValidationError,
  expectSuccess,
} from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { expectNotPersisted, seedField } from '../../src/fixtures/steps';
import { expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { LIMITS, PII_FIELDS, readPiiDataSchema, writePiiDataSchema } from '../../src/models/pii.models';

test.describe('PII write / upsert', { tag: ['@regression'] }, () => {
  onlyIfInScope('writePii', 'readPii');

  test(
    'PII-WR-001 Saving a new field returns 201 with tenant, user, field name and encryption key version',
    { tag: '@smoke' },
    async ({ pii, data, tenant, cleanup }) => {
      const userId = data.userId('wr1');
      const res = await pii.writePii({
        tenant_id: tenant,
        user_id: userId,
        field: PII_FIELDS.EMAIL,
        value: data.email(),
      });
      cleanup.leaveBehind('PII EMAIL', `${tenant}/${userId}`);
      const payload = expectSuccess(res, 201, writePiiDataSchema, 'PII write successful');
      expect(payload).toMatchObject({ tenant_id: tenant, user_id: userId, field: 'EMAIL' });
      expect(Number.isInteger(payload.key_version)).toBe(true);
    },
  );

  test('PII-WR-002 Saving a field that already exists replaces it (200), and reading returns the new value', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('wr2');
    await seedField(pii, cleanup, { tenant, userId, field: PII_FIELDS.EMAIL, value: data.email('old') });
    const newEmail = data.email('new');

    const replace = await pii.writePii({
      tenant_id: tenant,
      user_id: userId,
      field: PII_FIELDS.EMAIL,
      value: newEmail,
    });
    expectSuccess(replace, 200, writePiiDataSchema, 'PII write successful');

    const read = expectSuccess(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: [PII_FIELDS.EMAIL] }),
      200,
      readPiiDataSchema,
    );
    expect(read.count).toBe(1);
    expectSecretEquals(read.items[0]?.value, newEmail, 'replaced EMAIL');
  });

  test('PII-WR-003 Field names work in any case and come back in upper case (email → EMAIL)', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('wr3');
    const res = await pii.writePii({
      tenant_id: tenant,
      user_id: userId,
      field: 'eMail',
      value: data.email(),
    });
    cleanup.leaveBehind('PII EMAIL', `${tenant}/${userId}`);
    expect(expectSuccess(res, 201, writePiiDataSchema).field).toBe('EMAIL');
    const read = expectSuccess(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL'] }),
      200,
      readPiiDataSchema,
    );
    expect(read.items[0]?.field).toBe('EMAIL');
  });

  for (const missing of ['tenant_id', 'user_id', 'field', 'value'] as const) {
    test(`PII-WR-004 Save request without "${missing}" is rejected (422) and nothing is saved`, async ({
      pii,
      data,
      tenant,
    }) => {
      const userId = data.userId('wr4');
      const payload: Record<string, string> = {
        tenant_id: tenant,
        user_id: userId,
        field: 'NAME',
        value: data.name(),
      };
      delete payload[missing];
      expectRequestValidationError(await pii.call('writePii', payload));
      if (missing !== 'tenant_id' && missing !== 'user_id') {
        await expectNotPersisted(pii, { tenant, userId, field: 'NAME' });
      }
    });
  }

  for (const empty of ['user_id', 'field', 'value'] as const) {
    test(`PII-WR-005 Save request with an empty "${empty}" is rejected (422)`, async ({
      pii,
      data,
      tenant,
    }) => {
      const payload = {
        tenant_id: tenant,
        user_id: data.userId('wr5'),
        field: 'NAME',
        value: data.name(),
        [empty]: '',
      };
      expectRequestValidationError(await pii.call('writePii', payload));
    });
  }

  test('PII-WR-005b Save request with an empty tenant_id is rejected (422)', async ({ pii, data }) => {
    expectRequestValidationError(
      await pii.call('writePii', {
        tenant_id: '',
        user_id: data.userId('wr5b'),
        field: 'NAME',
        value: data.name(),
      }),
    );
  });

  test('PII-WR-006 Values longer than the documented maximum are rejected (422)', async ({
    pii,
    data,
    tenant,
  }) => {
    const base = { tenant_id: tenant, user_id: data.userId('wr6'), field: 'NAME', value: data.name() };
    const cases = {
      tenant_id: 't'.repeat(LIMITS.tenantId.max + 1),
      user_id: `${data.userId('wr6')}-`.padEnd(LIMITS.userId.max + 1, 'x'),
      field: 'F'.repeat(LIMITS.field.max + 1),
      value: data.textOfLength(LIMITS.value.max + 1),
    };
    for (const [key, value] of Object.entries(cases)) {
      await test.step(`${key} length ${value.length}`, async () => {
        expectRequestValidationError(await pii.call('writePii', { ...base, [key]: value }));
      });
    }
    await expectNotPersisted(pii, { tenant, userId: base.user_id, field: 'NAME' });
  });

  test('PII-WR-007 Values exactly at the documented maximum are accepted (user ID 128, name 1024 characters)', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = `${data.userId('wr7')}-`.padEnd(LIMITS.userId.max, 'x');
    expect(userId).toHaveLength(LIMITS.userId.max);
    const value = data.textOfLength(LIMITS.value.max);
    const res = await pii.writePii({ tenant_id: tenant, user_id: userId, field: 'NAME', value });
    cleanup.leaveBehind('PII NAME', `${tenant}/${userId}`);
    expectSuccess(res, 201, writePiiDataSchema);
    const read = expectSuccess(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['NAME'] }),
      200,
      readPiiDataSchema,
    );
    expectSecretEquals(read.items[0]?.value, value, '1024-char NAME');
  });

  test('PII-WR-008 An email without "@" is rejected (400 VALIDATION_ERROR)', async ({
    pii,
    data,
    tenant,
  }) => {
    const userId = data.userId('wr8');
    const res = await pii.writePii({
      tenant_id: tenant,
      user_id: userId,
      field: 'EMAIL',
      value: `qa-${data.runId}-no-at-sign`,
    });
    expectError(res, 400, ERROR_CODES.VALIDATION_ERROR);
    await expectNotPersisted(pii, { tenant, userId, field: 'EMAIL' });
  });

  test('PII-WR-009 A phone that does not have 8–15 digits after clean-up is rejected (400 VALIDATION_ERROR)', async ({
    pii,
    data,
    tenant,
  }) => {
    const userId = data.userId('wr9');
    // Synthetic INVALID values only (never stored): 7 digits, 16 digits, no digits.
    for (const [label, value] of Object.entries({
      sevenDigits: '123-4567',
      sixteenDigits: '+1234 5678 9012 3456',
      noDigits: 'not-a-phone',
    })) {
      await test.step(label, async () => {
        expectError(
          await pii.writePii({ tenant_id: tenant, user_id: userId, field: 'PHONE', value }),
          400,
          ERROR_CODES.VALIDATION_ERROR,
        );
      });
    }
    await expectNotPersisted(pii, { tenant, userId, field: 'PHONE' });
  });

  test('PII-WR-010 An unknown field name is rejected (exact status is open question Q-07)', async ({
    pii,
    data,
    tenant,
    config,
  }) => {
    noteAssumption(
      'Q-07',
      'Guide does not state the status for a field outside the catalog; 400/403/404/422 accepted.',
    );
    const userId = data.userId('wr10');
    const field = config.testData.unsupportedField;
    expectRejected(
      await pii.writePii({ tenant_id: tenant, user_id: userId, field, value: 'x' }),
      [400, 403, 404, 422],
      'Q-07',
    );
  });

  test('PII-WR-011 Wrong data types (e.g. a number instead of text) are rejected (422)', async ({
    pii,
    data,
    tenant,
  }) => {
    const base = { tenant_id: tenant, user_id: data.userId('wr11'), field: 'NAME', value: data.name() };
    for (const [key, bad] of Object.entries({
      value: 12345,
      tenant_id: null,
      user_id: ['a'],
      field: { x: 1 },
    })) {
      await test.step(`${key} as ${JSON.stringify(bad)}`, async () => {
        expectRequestValidationError(await pii.call('writePii', { ...base, [key]: bad }));
      });
    }
  });

  test('PII-WR-012 Broken JSON is rejected (422), even when correctly signed', async ({ pii }) => {
    const malformed = Buffer.from('{"tenant_id":"t","user_id":', 'utf8');
    expectRequestValidationError(await pii.call('writePii', undefined, { tamper: { bodyBytes: malformed } }));
  });

  test('PII-WR-013 A value made only of spaces is rejected (exact status is open question Q-10)', async ({
    pii,
    data,
    tenant,
  }) => {
    noteAssumption('Q-10', 'Whitespace-only NAME normalizes to empty; guide does not state 400 vs 422.');
    const userId = data.userId('wr13');
    expectRejected(
      await pii.writePii({ tenant_id: tenant, user_id: userId, field: 'NAME', value: '     ' }),
      [400, 422],
      'Q-10',
    );
    await expectNotPersisted(pii, { tenant, userId, field: 'NAME' });
  });
});
