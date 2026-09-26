/**
 * Guide "Value normalization" — verified through the API (write un-normalized, read back normalized).
 * DB-level representation checks are in tests/db.
 */
import { expectSuccess } from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { formattedPhone, messyEmail, messyText } from '../../src/data/test-data-factory';
import type { PiiClient } from '../../src/clients/pii-client';
import { expect, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { readPiiDataSchema, writePiiDataSchema } from '../../src/models/pii.models';

async function writeThenRead(
  pii: PiiClient,
  tenant: string,
  userId: string,
  field: string,
  input: string,
): Promise<unknown> {
  expectSuccess(
    await pii.writePii({ tenant_id: tenant, user_id: userId, field, value: input }),
    201,
    writePiiDataSchema,
  );
  const read = expectSuccess(
    await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: [field] }),
    200,
    readPiiDataSchema,
  );
  expect(read.count).toBe(1);
  return read.items[0]?.value;
}

test.describe('Normalization', { tag: ['@regression'] }, () => {
  onlyIfInScope('writePii', 'readPii');

  test(
    'PII-NRM-001 Emails are saved without surrounding spaces and in lower case',
    { tag: '@smoke' },
    async ({ pii, data, tenant, cleanup }) => {
      const userId = data.userId('nrm1');
      const expected = data.email();
      cleanup.leaveBehind('PII EMAIL', `${tenant}/${userId}`);
      expectSecretEquals(
        await writeThenRead(pii, tenant, userId, 'EMAIL', messyEmail(expected)),
        expected,
        'EMAIL',
      );
    },
  );

  test('PII-NRM-002 Phones are saved as digits only (spaces, dashes, brackets and + removed)', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('nrm2');
    const phone = data.phone(0);
    cleanup.leaveBehind('PII PHONE', `${tenant}/${userId}`);
    expectSecretEquals(
      await writeThenRead(pii, tenant, userId, 'PHONE', formattedPhone(phone.normalized)),
      phone.normalized,
      'PHONE',
    );
  });

  test('PII-NRM-003 Names are trimmed and repeated spaces collapsed; upper/lower case is kept', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('nrm3');
    const expected = data.name(); // e.g. "Qa Auto Bcde" — mixed case on purpose
    cleanup.leaveBehind('PII NAME', `${tenant}/${userId}`);
    expectSecretEquals(
      await writeThenRead(pii, tenant, userId, 'NAME', messyText(expected)),
      expected,
      'NAME',
    );
  });

  test('PII-NRM-004 Phones with exactly 8 and exactly 15 digits (the allowed limits) are accepted', async ({
    pii,
    data,
    tenant,
    config,
    cleanup,
  }) => {
    // Optional: the team tests with 10-digit numbers only. The 8/15-digit edges run only when approved
    // numbers of exactly those lengths are configured; otherwise the test is skipped (never failed).
    const eight = config.testData.phone8Digits;
    const fifteen = config.testData.phone15Digits;
    test.skip(
      !eight || !fifteen,
      'Only 10-digit test phone numbers are used, so the 8- and 15-digit limits are not tested. ' +
        'To test them, set PII_TEST_PHONE_8_DIGITS and PII_TEST_PHONE_15_DIGITS to approved numbers.',
    );
    if (!eight || !fifteen) return;
    for (const digits of [eight, fifteen]) {
      await test.step(`${digits.length} digits`, async () => {
        const userId = data.userId(`nrm4d${digits.length}`);
        cleanup.leaveBehind('PII PHONE', `${tenant}/${userId}`);
        expectSecretEquals(
          await writeThenRead(pii, tenant, userId, 'PHONE', formattedPhone(digits)),
          digits,
          `PHONE ${digits.length}`,
        );
      });
    }
  });

  test('PII-NRM-005 Values that are already clean are saved unchanged', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('nrm5');
    const email = data.email();
    cleanup.leaveBehind('PII EMAIL', `${tenant}/${userId}`);
    expectSecretEquals(await writeThenRead(pii, tenant, userId, 'EMAIL', email), email, 'EMAIL');
  });
});
