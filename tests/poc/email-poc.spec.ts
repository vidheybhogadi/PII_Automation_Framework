/**
 * EMAIL proof of concept through the Aisle PII facade (first priority).
 *
 *   POC-001  save a fake EMAIL          -> 201, saved field details, no echo of the email
 *   POC-002  read the fake EMAIL back   -> 200, cleaned-up value (normalization pending BQ-01)
 *   POC-003  database check             -> one record, email not readable (encryption format pending BQ-04)
 *
 * Today every EMAIL call returns 403 AUTHORIZATION_DENIED, so these tests are BLOCKED at runtime with the
 * real response (BQ-01). POC-003 is also BLOCKED by the `db` fixture until read-only DB access exists (BQ-04).
 * They run for real as soon as access is granted — nothing is faked.
 */
import { expectSuccess } from '../../src/assertions/response.assertions';
import {
  expectNotStoredAsPlaintext,
  expectResponseDoesNotEcho,
  expectSecretEquals,
} from '../../src/assertions/security.assertions';
import { messyEmail } from '../../src/data/test-data-factory';
import { BLOCKERS, seedField } from '../../src/fixtures/steps';
import {
  blockIfAccessDenied,
  expect,
  noteAssumption,
  onlyIfInScope,
  test,
} from '../../src/fixtures/test-fixtures';
import { PII_FIELDS, readPiiDataSchema, writePiiDataSchema } from '../../src/models/pii.models';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';

test.describe('POC — EMAIL through the Aisle facade', { tag: ['@poc', '@phase1'] }, () => {
  onlyIfInScope('writePii', 'readPii');

  test(
    'POC-001 Saving a fake email through Aisle returns 201 and confirms the saved field',
    { tag: ['@smoke'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('poc1');
      const email = data.email('poc1');
      const submitted = messyEmail(email);

      const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: submitted });
      blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
      cleanup.leaveBehind('PII EMAIL', userId);

      const saved = expectSuccess(res, 201, writePiiDataSchema, 'PII write successful');
      expect(saved).toMatchObject({ tenant_id: AISLE_TENANT, user_id: userId, field: PII_FIELDS.EMAIL });
      expect(saved.key_version).toBeGreaterThanOrEqual(1);
      expectResponseDoesNotEcho(res, email);
      expectResponseDoesNotEcho(res, submitted.trim());
    },
  );

  test(
    'POC-002 Reading a saved fake email returns it cleaned up: lower case, no extra spaces',
    { tag: ['@smoke'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('poc2');
      const email = data.email('poc2');
      await seedField(aisle, cleanup, {
        userId,
        field: PII_FIELDS.EMAIL,
        value: messyEmail(email),
        blocker: BLOCKERS.email,
      });

      const res = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.EMAIL] });
      blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
      const read = expectSuccess(res, 200, readPiiDataSchema, 'PII read successful');
      expect(read.count).toBe(1);
      expect(read.items[0]).toMatchObject({
        tenant_id: AISLE_TENANT,
        user_id: userId,
        field: PII_FIELDS.EMAIL,
      });
      noteAssumption('BQ-01', 'expected EMAIL normalization trim + lower-case — to be confirmed by Dev');
      expectSecretEquals(read.items[0]?.value, email, 'cleaned-up EMAIL');
    },
  );

  test(
    'POC-003 The saved fake email is in the database for the right user, and its readable text is not there',
    { tag: ['@smoke', '@db', '@security'] },
    async ({ db, aisle, data, cleanup }) => {
      const userId = data.userId('poc3');
      const email = data.email('poc3');
      const submitted = messyEmail(email);
      const saved = await seedField(aisle, cleanup, {
        userId,
        field: PII_FIELDS.EMAIL,
        value: submitted,
        blocker: BLOCKERS.email,
      });

      const rows = await db.findPiiRecords(saved.tenant_id, userId, PII_FIELDS.EMAIL);
      expect(rows, 'exactly one stored record for this user and field').toHaveLength(1);
      const row = rows[0]!;
      expect(row.user_id).toBe(userId);
      expect(row.field).toBe(PII_FIELDS.EMAIL);
      expect(row.tenant_id).toBe(saved.tenant_id);
      if (row.key_version !== undefined && row.key_version !== null) {
        expect(row.key_version, 'stored key version matches the save reply').toBe(saved.key_version);
      } else {
        noteAssumption('BQ-04', 'the DB query returns no key_version column; key version not compared');
      }
      // Necessary, not sufficient: "not readable" does not prove encryption (format pending BQ-04).
      noteAssumption('BQ-04', 'encryption format not confirmed — only "not stored readable" is checked');
      expectNotStoredAsPlaintext(row.encrypted_value, email, 'EMAIL stored value (cleaned form)');
      expectNotStoredAsPlaintext(row.encrypted_value, submitted.trim(), 'EMAIL stored value (typed form)');
    },
  );
});
