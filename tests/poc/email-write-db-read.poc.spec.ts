/**
 * POC-001 — First end-to-end proof of concept (Milestone 1).
 *
 *   1. Generate a unique, approved test user          6. Verify stored value is encrypted (basic checks
 *   2. Write EMAIL (un-normalized input) via API          + key_version metadata, if the schema exposes it)
 *   3. Verify 201 + documented envelope               7. Read EMAIL via API
 *   4. Query the DB through the repository layer      8. Verify value == documented normalized form
 *   5. Verify tenant/user/field association           9. Verify logs/report attachments contain no PII
 *                                                    10. Cleanup: no approved delete API -> recorded honestly
 *
 * Requires API config AND DB config. If the DB is not configured, the `db` fixture fails with an
 * actionable message — the DB checks are never silently skipped.
 */
import { expectError, expectSuccess } from '../../src/assertions/response.assertions';
import {
  expectNoSecretsIn,
  expectNotStoredAsPlaintext,
  expectSecretEquals,
} from '../../src/assertions/security.assertions';
import { messyEmail } from '../../src/data/test-data-factory';
import { expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { PII_FIELDS, readPiiDataSchema, writePiiDataSchema } from '../../src/models/pii.models';

test.describe('POC Write -> DB -> Read (EMAIL)', { tag: ['@poc', '@smoke', '@db'] }, () => {
  onlyIfInScope('writePii', 'readPii');

  test('POC-001 End to end: an email is cleaned up, stored encrypted for the right tenant and user, and read back', async ({
    pii,
    db,
    data,
    tenant,
    log,
    cleanup,
  }) => {
    // 1. Unique synthetic identity (run-prefixed, approved domain).
    const userId = data.userId('poc');
    const expectedEmail = data.email('poc'); // documented normalized form
    const submittedEmail = messyEmail(expectedEmail); // mixed case + surrounding spaces

    const preCheck = await pii.readPii({
      tenant_id: tenant,
      user_id: userId,
      field_names: [PII_FIELDS.EMAIL],
    });
    expectError(preCheck, 404, ERROR_CODES.PII_NOT_FOUND); // the user really is new

    // 2–3. Write.
    const written = await test.step('write EMAIL via API', async () => {
      const res = await pii.writePii({
        tenant_id: tenant,
        user_id: userId,
        field: PII_FIELDS.EMAIL,
        value: submittedEmail,
      });
      const payload = expectSuccess(res, 201, writePiiDataSchema, 'PII write successful');
      expect(payload).toMatchObject({ tenant_id: tenant, user_id: userId, field: PII_FIELDS.EMAIL });
      return payload;
    });
    cleanup.leaveBehind('PII EMAIL', `${tenant}/${userId}`);

    // 4–6. Database.
    await test.step('validate persisted record in DB', async () => {
      const rows = await db.findPiiRecords(tenant, userId, PII_FIELDS.EMAIL);
      expect(rows, 'exactly one row per (tenant, user, field)').toHaveLength(1);
      const row = rows[0]!;
      expect(row.tenant_id).toBe(tenant);
      expect(row.user_id).toBe(userId);
      expect(row.field).toBe(PII_FIELDS.EMAIL);

      // Basic at-rest checks: neither the normalized nor the submitted value is stored readable.
      expectNotStoredAsPlaintext(row.encrypted_value, expectedEmail, 'EMAIL ciphertext');
      expectNotStoredAsPlaintext(
        row.encrypted_value,
        submittedEmail.trim(),
        'EMAIL ciphertext (submitted form)',
      );

      if (row.key_version === undefined || row.key_version === null) {
        noteAssumption(
          'Q-16',
          'Catalog query returns no key_version column; DEK-version linkage not verified.',
        );
      } else {
        expect(row.key_version, 'DB key_version matches the API key_version').toBe(written.key_version);
      }
    });

    // 7–8. Read back.
    await test.step('read EMAIL via API and verify normalized value', async () => {
      const res = await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: [PII_FIELDS.EMAIL] });
      const read = expectSuccess(res, 200, readPiiDataSchema, 'PII read successful');
      expect(read.count).toBe(1);
      expect(read.items[0]).toMatchObject({ tenant_id: tenant, user_id: userId, field: PII_FIELDS.EMAIL });
      expectSecretEquals(read.items[0]?.value, expectedEmail, 'normalized EMAIL');
    });

    // 9. No sensitive values in what goes into the report.
    await test.step('verify logs contain no plaintext PII', async () => {
      const lines = log.lines();
      expect(lines.length).toBeGreaterThan(0);
      expectNoSecretsIn(lines, [expectedEmail, submittedEmail.trim()], 'api-calls.log');
      expectNoSecretsIn([JSON.stringify(test.info().annotations)], [expectedEmail], 'report annotations');
    });
    // 10. Cleanup summary is attached by the `cleanup` fixture (PII has no approved deletion API — Q-15).
  });
});
