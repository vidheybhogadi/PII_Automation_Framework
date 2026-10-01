/**
 * Read-only database checks behind the Aisle facade. The `db` fixture marks these BLOCKED (BQ-04) until
 * read-only DB access and the table layout are provided. Only SELECT queries from config/db-queries.json run.
 * "Not stored readable" is a necessary check, NOT proof of encryption (format pending BQ-04).
 * AISLE-DB-006…013 check the encrypted layout described in the PII-service design (tech doc v3) — per design,
 * to be confirmed by Dev (BQ-04, BQ-45). AISLE-DB-014/015 read the audit trail; the `audit` fixture marks them
 * BLOCKED (BQ-30) until read-only audit access exists. Stored bytes, keys and values are compared only through
 * fingerprints and are never printed. Never the Aisle app database (aisleweb).
 */
import { expectError, expectSuccess, expectValidationError } from '../../src/assertions/response.assertions';
import {
  expectBytesNotStored,
  expectNoSecretsIn,
  expectNotStoredAsPlaintext,
  fingerprint,
} from '../../src/assertions/security.assertions';
import type { AislePiiClient } from '../../src/clients/aisle-pii-client';
import type { AuditEntry } from '../../src/db/audit-repository';
import type { PiiRecordRow } from '../../src/db/pii-repository';
import { BLOCKERS, createKey, createTransient, seedField, type Blocker } from '../../src/fixtures/steps';
import {
  blockIfAccessDenied,
  expect,
  noteAssumption,
  noteObserved,
  requireApprovedPhones,
  test,
} from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { revokeFreeTextKeyDataSchema } from '../../src/models/free-text.models';
import {
  batchReadDataSchema,
  PII_FIELDS,
  readPiiDataSchema,
  searchIdsOnlyDataSchema,
  searchWithValuesDataSchema,
  writePiiDataSchema,
  type WritePiiData,
} from '../../src/models/pii.models';
import { promoteTransientPhoneDataSchema } from '../../src/models/transient.models';
import type { CleanupRegistry } from '../../src/utils/cleanup';
import { runInPhase } from '../../src/utils/phase';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';

/** Design v3 (tech_doc_v3_detailed.md) expectations, not yet confirmed against a real PII database. */
const DESIGN_NOTE =
  'per the PII-service design (tech doc v3) — table layout and format to be confirmed by Dev';

/** Shortest temporary-phone lifetime accepted on staging (observed 2026-10-01). */
const TRANSIENT_TTL_SECONDS = 300;

/** Audit entries are kept for 7 days (design v3). */
const AUDIT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const storedFingerprint = (stored: unknown): string =>
  fingerprint(Buffer.isBuffer(stored) ? stored : String(stored));

/** A design column the query must return as bytes (bytea). Fails naming the column only, never the value. */
function bytesOf(value: unknown, column: string): Buffer {
  expect(Buffer.isBuffer(value), `the database query returns "${column}" as bytes`).toBe(true);
  return value as Buffer;
}

function millisOf(value: unknown, column: string): number {
  expect(value !== null && value !== undefined, `the database query returns "${column}"`).toBe(true);
  const ms = new Date(value as string | Date).getTime();
  expect(Number.isNaN(ms), `"${column}" is a valid time`).toBe(false);
  return ms;
}

/** Fingerprint-only snapshot of a stored record (nothing readable is kept or printed). */
function snapshot(row: PiiRecordRow): Record<string, string | number | null | undefined> {
  return {
    encrypted_value: storedFingerprint(row.encrypted_value),
    nonce: row.nonce == null ? null : storedFingerprint(row.nonce),
    key_version: row.key_version,
    updated_at: row.updated_at == null ? null : millisOf(row.updated_at, 'updated_at'),
  };
}

/** Exactly one stored record for the user and field. */
async function onlyRecord(rows: Promise<PiiRecordRow[]>, what: string): Promise<PiiRecordRow> {
  const list = await rows;
  expect(list, `exactly one stored ${what} record`).toHaveLength(1);
  return list[0]!;
}

/** The parts of an AES-256-GCM record from the design: 12-byte nonce, 16-byte tag, non-empty value, key ≥ 1. */
function expectEncryptedLayout(row: PiiRecordRow, what: string): void {
  expect(bytesOf(row.nonce, 'nonce').length, `${what}: nonce is exactly 12 bytes`).toBe(12);
  expect(bytesOf(row.auth_tag, 'auth_tag').length, `${what}: auth tag is exactly 16 bytes`).toBe(16);
  const size = Buffer.isBuffer(row.encrypted_value)
    ? row.encrypted_value.length
    : String(row.encrypted_value).length;
  expect(size > 0, `${what}: encrypted value is not empty`).toBe(true);
  expect(typeof row.key_version === 'number', `${what}: the query returns a key version`).toBe(true);
  expect(row.key_version as number, `${what}: key version is 1 or higher`).toBeGreaterThanOrEqual(1);
}

/** A phone must not be readable as typed, as digits only, or in E.164 form (+91 = design default region India). */
function expectPhoneNotReadable(
  stored: PiiRecordRow['encrypted_value'],
  phone: { input: string; normalized: string },
): void {
  const forms = [phone.input, phone.normalized, `+91${phone.normalized}`];
  forms.forEach((form, index) =>
    expectNotStoredAsPlaintext(stored, form, `PHONE stored value (phone form #${index + 1})`),
  );
}

/** Save one field and expect an exact status (201 new / 200 replaced, observed on staging). */
async function save(
  aisle: AislePiiClient,
  cleanup: CleanupRegistry,
  args: { userId: string; field: string; value: string; status: 200 | 201; blocker?: Blocker },
): Promise<WritePiiData> {
  return test.step(`save ${args.field} (expect ${args.status})`, () =>
    runInPhase('setup', async () => {
      const res = await aisle.writePii({ user_id: args.userId, field: args.field, value: args.value });
      if (args.blocker) blockIfAccessDenied(res, args.blocker.id, args.blocker.reason);
      const data = expectSuccess(res, args.status, writePiiDataSchema);
      cleanup.leaveBehind(`PII ${args.field}`, args.userId);
      return data;
    }));
}

/** Exactly one audit entry for a request. */
function onlyEntry(entries: AuditEntry[], what: string): AuditEntry {
  expect(entries, `exactly one audit entry for the ${what} request`).toHaveLength(1);
  return entries[0]!;
}

/** The entry names the field, either as `field_name` or in `fields_requested` (design v3). */
function entryFields(entry: AuditEntry): string[] {
  return [entry.field_name ?? '', ...(entry.fields_requested ?? [])].filter((f) => f.length > 0);
}

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

  test('AISLE-DB-004 A saved fake email is stored once for the right user, without readable text', async ({
    db,
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-04', 'encryption format not confirmed — only "not stored readable" is checked');
    const userId = data.userId('db4');
    const email = data.email('db4');
    const saved = await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      blocker: BLOCKERS.email,
    });

    const rows = await db.findPiiRecords(saved.tenant_id, userId, PII_FIELDS.EMAIL);
    expect(rows, 'exactly one stored EMAIL record').toHaveLength(1);
    const row = rows[0]!;
    expect(row.user_id).toBe(userId);
    expect(row.field).toBe(PII_FIELDS.EMAIL);
    expect(row.tenant_id).toBe(saved.tenant_id);
    expectNotStoredAsPlaintext(row.encrypted_value, email, 'EMAIL stored value');
  });

  test('AISLE-DB-005 A save rejected for a blank value (422) leaves nothing in the database', async ({
    db,
    aisle,
    data,
  }) => {
    const userId = data.userId('db5');
    const res = await aisle.call('writePii', { user_id: userId, field: PII_FIELDS.NAME, value: '   ' });
    expectValidationError(res, 'value');

    const rows = await db.findPiiRecords(AISLE_TENANT, userId, PII_FIELDS.NAME);
    expect(rows, 'no record for the rejected save').toHaveLength(0);
  });

  test('AISLE-DB-006 A saved fake name is stored in the designed encrypted layout: 12-byte nonce, 16-byte tamper seal and the key version from the save reply', async ({
    db,
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-04', `encrypted layout ${DESIGN_NOTE}`);
    const userId = data.userId('db6');
    const name = data.name();
    const saved = await save(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name, status: 201 });

    const row = await onlyRecord(db.findPiiRecords(saved.tenant_id, userId, PII_FIELDS.NAME), 'NAME');
    expectEncryptedLayout(row, 'NAME record');
    expect(row.key_version, 'stored key version matches the save reply').toBe(saved.key_version);
    expectNotStoredAsPlaintext(row.encrypted_value, name, 'NAME stored value');
  });

  test('AISLE-DB-007 Saving the same fake name twice re-encrypts it: still one record, with a new nonce, new encrypted bytes and a later update time', async ({
    db,
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-04', `fresh nonce on every save ${DESIGN_NOTE}`);
    noteObserved('2026-10-01', 'first save → 201, saving again → 200 (replaced)');
    const userId = data.userId('db7');
    const name = data.name();
    const first = await save(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name, status: 201 });
    const before = await onlyRecord(db.findPiiRecords(first.tenant_id, userId, PII_FIELDS.NAME), 'NAME');

    await save(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name, status: 200 });
    const after = await onlyRecord(db.findPiiRecords(first.tenant_id, userId, PII_FIELDS.NAME), 'NAME');

    expect(
      storedFingerprint(bytesOf(after.nonce, 'nonce')) !== storedFingerprint(bytesOf(before.nonce, 'nonce')),
      'the nonce changed after saving the same name again',
    ).toBe(true);
    expect(
      storedFingerprint(after.encrypted_value) !== storedFingerprint(before.encrypted_value),
      'the encrypted bytes changed after saving the same name again',
    ).toBe(true);
    expect(
      millisOf(after.updated_at, 'updated_at') > millisOf(before.updated_at, 'updated_at'),
      'the last-updated time moved forward',
    ).toBe(true);
  });

  test('AISLE-DB-008 A saved approved test phone is stored once, and the number is not readable in any common phone format', async ({
    db,
    aisle,
    data,
    config,
    cleanup,
  }) => {
    requireApprovedPhones(config);
    noteAssumption(
      'BQ-04',
      `PHONE storage ${DESIGN_NOTE}; E.164 form built with +91 (design default region India)`,
    );
    const userId = data.userId('db8');
    const phone = data.phone(0);
    const saved = await save(aisle, cleanup, {
      userId,
      field: PII_FIELDS.PHONE,
      value: phone.input,
      status: 201,
      blocker: BLOCKERS.phone,
    });

    const row = await onlyRecord(db.findPiiRecords(saved.tenant_id, userId, PII_FIELDS.PHONE), 'PHONE');
    expect(row.user_id).toBe(userId);
    expect(row.field).toBe(PII_FIELDS.PHONE);
    expect(row.key_version, 'stored key version matches the save reply').toBe(saved.key_version);
    expectPhoneNotReadable(row.encrypted_value, phone);
  });

  test('AISLE-DB-009 Two users with the same fake email share one search fingerprint; a different email gets a different one; a name gets none', async ({
    db,
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-04', `search fingerprint (lookup token) ${DESIGN_NOTE}`);
    noteObserved(
      '2026-10-01',
      'emails are saved in lower case (AISLE-SR-001); a shared email finds both owners (AISLE-SR-010)',
    );
    const [userA, userB, userC] = [data.userId('db9a'), data.userId('db9b'), data.userId('db9c')];
    const email = data.email('db9');
    const otherEmail = data.email('db9x');
    const opts = { field: PII_FIELDS.EMAIL, status: 201 as const, blocker: BLOCKERS.email };
    const saved = await save(aisle, cleanup, { ...opts, userId: userA, value: email });
    await save(aisle, cleanup, { ...opts, userId: userB, value: email.toUpperCase() });
    await save(aisle, cleanup, { ...opts, userId: userC, value: otherEmail });
    await save(aisle, cleanup, { userId: userA, field: PII_FIELDS.NAME, value: data.name(), status: 201 });

    const tenant = saved.tenant_id;
    const rowA = await onlyRecord(db.findPiiRecords(tenant, userA, PII_FIELDS.EMAIL), 'EMAIL (user A)');
    const rowB = await onlyRecord(db.findPiiRecords(tenant, userB, PII_FIELDS.EMAIL), 'EMAIL (user B)');
    const rowC = await onlyRecord(db.findPiiRecords(tenant, userC, PII_FIELDS.EMAIL), 'EMAIL (user C)');
    const nameA = await onlyRecord(db.findPiiRecords(tenant, userA, PII_FIELDS.NAME), 'NAME (user A)');

    const tokenA = storedFingerprint(bytesOf(rowA.lookup_token, 'lookup_token'));
    const tokenB = storedFingerprint(bytesOf(rowB.lookup_token, 'lookup_token'));
    const tokenC = storedFingerprint(bytesOf(rowC.lookup_token, 'lookup_token'));
    expect(tokenA === tokenB, 'the same email (once in capitals) gives the same fingerprint').toBe(true);
    expect(tokenA === tokenC, 'a different email gives a different fingerprint').toBe(false);
    expect(nameA.lookup_token === null, 'a NAME record has no search fingerprint (empty)').toBe(true);
  });

  test('AISLE-DB-010 Promoting a temporary phone stores it as a normal encrypted PHONE record for the user', async ({
    db,
    aisle,
    data,
    config,
    cleanup,
  }) => {
    requireApprovedPhones(config);
    noteAssumption('BQ-04', `promote writes a normal PHONE record ${DESIGN_NOTE}`);
    const userId = data.userId('db10');
    const phone = data.phone(0);
    const created = await createTransient(aisle, { phone: phone.input, ttlSeconds: TRANSIENT_TTL_SECONDS });

    const res = await aisle.promoteTransientPhone({ transient_id: created.transient_id, user_id: userId });
    blockIfAccessDenied(res, BLOCKERS.transient.id, BLOCKERS.transient.reason);
    cleanup.leaveBehind('PII PHONE', userId);
    noteAssumption('BQ-02', 'create → 201 and promote → 200 reply format — to be confirmed by Dev');
    const promoted = expectSuccess(res, 200, promoteTransientPhoneDataSchema);

    const row = await onlyRecord(db.findPiiRecords(promoted.tenant_id, userId, PII_FIELDS.PHONE), 'PHONE');
    expectEncryptedLayout(row, 'promoted PHONE record');
    bytesOf(row.lookup_token, 'lookup_token');
    expectPhoneNotReadable(row.encrypted_value, phone);
  });

  test('AISLE-DB-011 Exactly one encryption key is active, and a newly saved record points to a key that exists', async ({
    db,
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-04', `key list (key number and status only) ${DESIGN_NOTE}`);
    const userId = data.userId('db11');
    const saved = await save(aisle, cleanup, {
      userId,
      field: PII_FIELDS.NAME,
      value: data.name(),
      status: 201,
    });

    const keys = await db.findKeyRegistry();
    const active = keys.filter((k) => k.status === 'ACTIVE');
    expect(active, 'exactly one ACTIVE key').toHaveLength(1);
    expect(
      keys.every((k) => ['READY', 'ACTIVE', 'READ_ONLY'].includes(k.status)),
      'every key status is READY, ACTIVE or READ_ONLY',
    ).toBe(true);

    const row = await onlyRecord(db.findPiiRecords(saved.tenant_id, userId, PII_FIELDS.NAME), 'NAME');
    expect(
      keys.some((k) => k.key_version === row.key_version),
      'the record’s key version is in the key list',
    ).toBe(true);
    expect(row.key_version, 'a new save uses the ACTIVE key').toBe(active[0]!.key_version);
  });

  test('AISLE-DB-012 Reading, bulk-reading and searching a fake user’s data leaves the stored records unchanged', async ({
    db,
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-04', `reads change nothing in storage ${DESIGN_NOTE}`);
    noteObserved('2026-10-01', 'read, bulk read and search with values → 200');
    const userId = data.userId('db12');
    const email = data.email('db12');
    const saved = await save(aisle, cleanup, {
      userId,
      field: PII_FIELDS.NAME,
      value: data.name(),
      status: 201,
    });
    await save(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      status: 201,
      blocker: BLOCKERS.email,
    });
    const fields = [PII_FIELDS.NAME, PII_FIELDS.EMAIL];
    const look = async () => {
      const result: Record<string, ReturnType<typeof snapshot>> = {};
      for (const field of fields) {
        const row = await onlyRecord(db.findPiiRecords(saved.tenant_id, userId, field), field);
        millisOf(row.updated_at, 'updated_at');
        bytesOf(row.nonce, 'nonce');
        result[field] = snapshot(row);
      }
      return result;
    };
    const before = await look();

    expectSuccess(await aisle.readPii({ user_id: userId, field_names: fields }), 200, readPiiDataSchema);
    expectSuccess(await aisle.batchRead({ user_ids: [userId], fields }), 200, batchReadDataSchema);
    const search = await aisle.searchPii(PII_FIELDS.EMAIL, { value: email, limit: 10, include_values: true });
    blockIfAccessDenied(search, BLOCKERS.search.id, BLOCKERS.search.reason);
    expectSuccess(search, 200, searchWithValuesDataSchema);

    expect(await look(), 'stored records (fingerprints only) are unchanged after the reads').toEqual(before);
  });

  test('AISLE-DB-013 A free-text key is stored without the raw key being readable, and revoking it marks the record REVOKED with a time', async ({
    db,
    aisle,
    cleanup,
  }) => {
    noteAssumption('BQ-45', 'free-text key table and storage format unknown — to be confirmed by Dev');
    const key = await createKey(aisle, cleanup);
    const rawKey = Buffer.from(key.key, 'base64');

    const stored = await db.findFreeTextKey(key.key_id);
    expect(stored, 'one stored record for the key ID').toBeDefined();
    expect(stored!.status, 'stored status before the revoke').toBe('ACTIVE');
    expectBytesNotStored(stored!.encrypted_key_material, rawKey, 'stored free-text key');

    const res = await aisle.revokeFreeTextKey({ key_id: key.key_id });
    blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
    noteObserved('2026-10-01', 'revoke → 200 with status REVOKED');
    expectSuccess(res, 200, revokeFreeTextKeyDataSchema);

    const revoked = await db.findFreeTextKey(key.key_id);
    expect(revoked, 'the record still exists after the revoke').toBeDefined();
    expect(revoked!.status, 'stored status after the revoke').toBe('REVOKED');
    millisOf(revoked!.revoked_at, 'revoked_at');
  });
});

test.describe('Aisle facade — audit trail (read-only)', { tag: ['@db', '@security'] }, () => {
  test('AISLE-DB-014 Saving, reading and searching fake data each leave one audit entry with no personal values in it', async ({
    audit,
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption(
      'BQ-30',
      'audit entry format per design v3, and that the facade’s X-Request-Id is the audit request_id',
    );
    const userId = data.userId('db14');
    const email = data.email('db14');

    const write = await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: email });
    blockIfAccessDenied(write, BLOCKERS.email.id, BLOCKERS.email.reason);
    expectSuccess(write, 201, writePiiDataSchema);
    cleanup.leaveBehind('PII EMAIL', userId);
    const read = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.EMAIL] });
    expectSuccess(read, 200, readPiiDataSchema);
    const search = await aisle.searchPii(PII_FIELDS.EMAIL, {
      value: email,
      limit: 10,
      include_values: false,
    });
    blockIfAccessDenied(search, BLOCKERS.search.id, BLOCKERS.search.reason);
    expectSuccess(search, 200, searchIdsOnlyDataSchema);

    const checks = [
      { what: 'save', res: write, action: 'PII_WRITE', listsUser: true },
      { what: 'read', res: read, action: 'PII_READ', listsUser: true },
      { what: 'search', res: search, action: 'PII_SEARCH', listsUser: false },
    ];
    const all: AuditEntry[] = [];
    for (const check of checks) {
      const entry = onlyEntry(await audit.findByRequestId(check.res.requestId), check.what);
      all.push(entry);
      expect(entry.action, `${check.what}: audit action`).toBe(check.action);
      expect(entry.status, `${check.what}: audit status`).toBe('SUCCESS');
      expect(entryFields(entry), `${check.what}: the entry names the EMAIL field`).toContain(
        PII_FIELDS.EMAIL,
      );
      if (check.listsUser) {
        expect(entry.user_ids ?? [], `${check.what}: the entry lists the fake user`).toContain(userId);
      } else {
        expect(entry.result_count ?? 0, `${check.what}: result count is 1 or more`).toBeGreaterThanOrEqual(1);
      }
      const created = millisOf(entry.created_at, 'created_at');
      const expires = millisOf(entry.expires_at, 'expires_at');
      expect(
        Math.abs(expires - created - AUDIT_RETENTION_MS) <= 60_000,
        `${check.what}: the entry expires 7 days after it was created`,
      ).toBe(true);
    }
    expectNoSecretsIn(
      all.map((entry) => JSON.stringify(entry)),
      [email],
      'audit entries (email and search term)',
    );
  });

  test('AISLE-DB-015 A save refused with 403 (access denied) leaves an audit entry marked as an authorization failure', async ({
    audit,
    aisle,
    data,
    config,
  }) => {
    noteObserved('2026-09-29', 'an unknown field name → 403 AUTHORIZATION_DENIED');
    noteAssumption(
      'BQ-30',
      'which audit action and status this 403 records (design: AUTHZ_FAILURE / DENIED)',
    );
    const name = data.name();
    const res = await aisle.call('writePii', {
      user_id: data.userId('db15'),
      field: config.testData.unsupportedField,
      value: name,
    });
    expectError(res, 403, ERROR_CODES.AUTHORIZATION_DENIED);

    const entry = onlyEntry(await audit.findByRequestId(res.requestId), 'refused save');
    expect(entry.action, 'audit action').toBe('AUTHZ_FAILURE');
    expect(entry.status, 'audit status').toBe('DENIED');
    expectNoSecretsIn([JSON.stringify(entry)], [name], 'audit entry (fake name)');
  });
});
