/**
 * Read-only database checks behind the Aisle facade. The `db` fixture marks these BLOCKED (BQ-04) until
 * read-only DB access and the table layout are provided. Only SELECT queries from config/db-queries.json run.
 * "Not stored readable" is a necessary check, NOT proof of encryption (format pending BQ-04).
 */
import { expectUnauthorized } from '../../src/assertions/response.assertions';
import { expectNotStoredAsPlaintext, fingerprint } from '../../src/assertions/security.assertions';
import { seedField } from '../../src/fixtures/steps';
import { expect, noteAssumption, test } from '../../src/fixtures/test-fixtures';
import { PII_FIELDS } from '../../src/models/pii.models';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';

const storedFingerprint = (stored: unknown): string =>
  fingerprint(Buffer.isBuffer(stored) ? stored : String(stored));

test.describe('Aisle facade — database (read-only)', { tag: ['@db', '@security'] }, () => {
  test('AISLE-DB-001 A saved fake name is stored once for the right user, without readable text', async ({
    db,
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-04', 'encryption format not confirmed — only "not stored readable" is checked');
    const userId = data.userId('db1');
    const name = data.name();
    const saved = await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });

    const rows = await db.findPiiRecords(saved.tenant_id, userId, PII_FIELDS.NAME);
    expect(rows, 'exactly one stored record').toHaveLength(1);
    const row = rows[0]!;
    expect(row.user_id).toBe(userId);
    expect(row.field).toBe(PII_FIELDS.NAME);
    expect(row.tenant_id).toBe(saved.tenant_id);
    if (row.key_version !== undefined && row.key_version !== null) {
      expect(row.key_version, 'stored key version matches the save reply').toBe(saved.key_version);
    } else {
      noteAssumption('BQ-04', 'the DB query returns no key_version column; key version not compared');
    }
    expectNotStoredAsPlaintext(row.encrypted_value, name, 'NAME stored value');
  });

  test('AISLE-DB-002 Replacing a name keeps one record and changes the stored bytes', async ({
    db,
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-04', 'encryption format not confirmed — only "not stored readable" is checked');
    const userId = data.userId('db2');
    const first = await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: data.name() });
    const before = await db.findPiiRecords(first.tenant_id, userId, PII_FIELDS.NAME);
    expect(before, 'one record after the first save').toHaveLength(1);

    const newName = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: newName });
    const after = await db.findPiiRecords(first.tenant_id, userId, PII_FIELDS.NAME);
    expect(after, 'still one record after replacing').toHaveLength(1);

    expect(
      storedFingerprint(after[0]!.encrypted_value) !== storedFingerprint(before[0]!.encrypted_value),
      'stored bytes changed after replacing the name',
    ).toBe(true);
    expectNotStoredAsPlaintext(after[0]!.encrypted_value, newName, 'replaced NAME stored value');
  });

  test('AISLE-DB-003 A save refused for a missing token (401) leaves nothing in the database', async ({
    db,
    aisle,
    data,
  }) => {
    const userId = data.userId('db3');
    const res = await aisle.call(
      'writePii',
      { user_id: userId, field: PII_FIELDS.NAME, value: data.name() },
      { tamper: { authorization: null } },
    );
    expectUnauthorized(res);

    const rows = await db.findPiiRecords(AISLE_TENANT, userId, PII_FIELDS.NAME);
    expect(rows, 'no record for the refused save').toHaveLength(0);
  });
});
