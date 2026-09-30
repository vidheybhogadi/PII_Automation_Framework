/**
 * NAME proof of concept through the Aisle PII facade (first priority).
 *
 *   POC-001  save a fake NAME          -> 201, saved field details, no echo of the name
 *   POC-002  read a messy fake NAME    -> 200, cleaned-up value (trim + collapse spaces — observed)
 *   POC-003  database check            -> one record, name not readable (encryption format pending BQ-04)
 *
 * NAME is the field the Aisle caller can use today. POC-003 is BLOCKED by the `db` fixture until read-only DB
 * access exists (BQ-04). EMAIL is covered separately (AISLE-WR-010, blocked by BQ-01).
 */
import { expectSuccess } from '../../src/assertions/response.assertions';
import {
  expectNotStoredAsPlaintext,
  expectResponseDoesNotEcho,
  expectSecretEquals,
} from '../../src/assertions/security.assertions';
import { messyText } from '../../src/data/test-data-factory';
import { seedField } from '../../src/fixtures/steps';
import { expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { PII_FIELDS, readPiiDataSchema, writePiiDataSchema } from '../../src/models/pii.models';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';

test.describe('POC — NAME through the Aisle facade', { tag: ['@poc', '@phase1'] }, () => {
  onlyIfInScope('writePii', 'readPii');

  test(
    'POC-001 Saving a fake name through Aisle returns 201 and confirms the saved field',
    { tag: ['@smoke'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('poc1');
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
    'POC-002 Reading a saved messy fake name returns it cleaned up: trimmed, single spaces',
    { tag: ['@smoke'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('poc2');
      const clean = data.name();
      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: messyText(clean) });

      const res = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] });
      const read = expectSuccess(res, 200, readPiiDataSchema, 'PII read successful');
      expect(read.count).toBe(1);
      expect(read.items[0]).toMatchObject({
        tenant_id: AISLE_TENANT,
        user_id: userId,
        field: PII_FIELDS.NAME,
      });
      expectSecretEquals(read.items[0]?.value, clean, 'cleaned-up NAME');
    },
  );

  test(
    'POC-003 The saved fake name is in the database for the right user, and its readable text is not there',
    { tag: ['@smoke', '@db', '@security'] },
    async ({ db, aisle, data, cleanup }) => {
      const userId = data.userId('poc3');
      const clean = data.name();
      const submitted = messyText(clean);
      const saved = await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: submitted });

      const rows = await db.findPiiRecords(saved.tenant_id, userId, PII_FIELDS.NAME);
      expect(rows, 'exactly one stored record for this user and field').toHaveLength(1);
      const row = rows[0]!;
      expect(row.user_id).toBe(userId);
      expect(row.field).toBe(PII_FIELDS.NAME);
      expect(row.tenant_id).toBe(saved.tenant_id);
      if (row.key_version !== undefined && row.key_version !== null) {
        expect(row.key_version, 'stored key version matches the save reply').toBe(saved.key_version);
      } else {
        noteAssumption('BQ-04', 'the DB query returns no key_version column; key version not compared');
      }
      // Necessary, not sufficient: "not readable" does not prove encryption (format pending BQ-04).
      noteAssumption('BQ-04', 'encryption format not confirmed — only "not stored readable" is checked');
      expectNotStoredAsPlaintext(row.encrypted_value, clean, 'NAME stored value (cleaned form)');
      expectNotStoredAsPlaintext(row.encrypted_value, submitted.trim(), 'NAME stored value (typed form)');
    },
  );
});
