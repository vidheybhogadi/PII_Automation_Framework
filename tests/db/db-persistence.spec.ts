/**
 * Database validation (read-only). Requires DB configuration + SQL catalog (docs/database-setup.md).
 * If DB is not configured, the `db` fixture fails each test with an actionable message.
 *
 * Deliberately NOT asserted: specific ciphertext values or determinism (not documented).
 * "Not plaintext" checks are basic evidence only, combined with key_version metadata and API behaviour.
 */
import { expectError, expectSuccess } from '../../src/assertions/response.assertions';
import { expectNotStoredAsPlaintext, fingerprint } from '../../src/assertions/security.assertions';
import { serializeBody } from '../../src/clients/base-api-client';
import { createKey, createTransient, seedField } from '../../src/fixtures/steps';
import { blockedBy, expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { AUTH_ERROR_CODES } from '../../src/models/common.models';
import { revokeFreeTextKeyDataSchema } from '../../src/models/free-text.models';
import { batchReadDataSchema, writePiiDataSchema } from '../../src/models/pii.models';
import { promoteTransientPhoneDataSchema } from '../../src/models/transient.models';

const asBuffer = (v: Buffer | string) => (Buffer.isBuffer(v) ? v : Buffer.from(v));

test.describe('Database persistence', { tag: ['@db', '@regression'] }, () => {
  onlyIfInScope('writePii', 'readPii');

  test('PII-DB-001 Saving a field again keeps one database row and changes its encrypted value', async ({
    pii,
    db,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('db1');
    const first = data.email('first');
    const second = data.email('second');
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: first });
    const before = await db.findPiiRecords(tenant, userId, 'EMAIL');
    expect(before).toHaveLength(1);

    const replaced = expectSuccess(
      await pii.writePii({ tenant_id: tenant, user_id: userId, field: 'EMAIL', value: second }),
      200,
      writePiiDataSchema,
    );
    const after = await db.findPiiRecords(tenant, userId, 'EMAIL');
    expect(after, 'upsert must not create a second row').toHaveLength(1);
    // Different plaintext -> different ciphertext under any encryption scheme; this does NOT assume determinism.
    expect(fingerprint(asBuffer(after[0]!.encrypted_value))).not.toBe(
      fingerprint(asBuffer(before[0]!.encrypted_value)),
    );
    expectNotStoredAsPlaintext(after[0]!.encrypted_value, second, 'replaced EMAIL');
    if (after[0]!.key_version !== undefined && after[0]!.key_version !== null) {
      expect(after[0]!.key_version).toBe(replaced.key_version);
    }
  });

  test('PII-DB-002 Phone and name are stored encrypted: neither the typed nor the cleaned-up text is in the database', async ({
    pii,
    db,
    data,
    tenant,
    cleanup,
  }) => {
    const userId = data.userId('db2');
    const phone = data.phone(0);
    const name = data.name();
    await seedField(pii, cleanup, { tenant, userId, field: 'PHONE', value: phone.input });
    await seedField(pii, cleanup, { tenant, userId, field: 'NAME', value: name });
    const [phoneRow] = await db.findPiiRecords(tenant, userId, 'PHONE');
    const [nameRow] = await db.findPiiRecords(tenant, userId, 'NAME');
    expectNotStoredAsPlaintext(phoneRow?.encrypted_value, phone.normalized, 'PHONE');
    expectNotStoredAsPlaintext(nameRow?.encrypted_value, name, 'NAME');
  });

  test('PII-DB-003 The same user ID in two tenants gives two separate rows, each tied to its own tenant', async ({
    pii,
    db,
    data,
    tenant,
    cleanup,
  }) => {
    const otherTenant = data.secondaryTenant();
    const userId = data.userId('db3');
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: data.email('a') });
    await seedField(pii, cleanup, { tenant: otherTenant, userId, field: 'EMAIL', value: data.email('b') });
    const rowsA = await db.findPiiRecords(tenant, userId, 'EMAIL');
    const rowsB = await db.findPiiRecords(otherTenant, userId, 'EMAIL');
    expect(rowsA.map((r) => r.tenant_id)).toEqual([tenant]);
    expect(rowsB.map((r) => r.tenant_id)).toEqual([otherTenant]);
  });

  test('PII-DB-004 A save rejected for a bad signature (401) leaves nothing in the database', async ({
    pii,
    db,
    data,
    tenant,
    unregisteredSigner,
  }) => {
    const request = { tenant_id: tenant, user_id: data.userId('db4'), field: 'EMAIL', value: data.email() };
    expectError(
      await pii.writePii(request, { tamper: { signWith: unregisteredSigner } }),
      401,
      AUTH_ERROR_CODES,
    );
    const tamperedBody = serializeBody({ ...request, user_id: `${request.user_id}-x` });
    expectError(
      await pii.writePii(request, {
        tamper: { signOverBytes: serializeBody(request), bodyBytes: tamperedBody },
      }),
      401,
      AUTH_ERROR_CODES,
    );
    expect(await db.findPiiRecords(tenant, request.user_id, 'EMAIL')).toHaveLength(0);
    expect(await db.findPiiRecords(tenant, `${request.user_id}-x`, 'EMAIL')).toHaveLength(0);
  });

  test('PII-DB-005 A temporary phone is stored encrypted, tied to its tenant, and marked used once promoted', async ({
    pii,
    db,
    data,
    tenant,
    config,
    cleanup,
  }) => {
    const phone = data.phone(0);
    const created = await createTransient(pii, {
      tenant,
      phone: phone.input,
      ttlSeconds: config.limits.transientTtlMinSeconds,
    });
    const row = await db.findTransientPhone(created.transient_id);
    expect(row, 'transient row exists after create').toBeDefined();
    expect(row!.tenant_id).toBe(tenant);
    expect(row!.is_consumed).toBe(false);
    expectNotStoredAsPlaintext(row!.encrypted_value, phone.normalized, 'transient phone');
    const skew = config.limits.clockSkewToleranceSeconds * 1000;
    expect(
      Math.abs(new Date(row!.expires_at).getTime() - Date.parse(created.expires_at)),
    ).toBeLessThanOrEqual(skew);

    const userId = data.userId('db5');
    expectSuccess(
      await pii.promoteTransientPhone({
        tenant_id: tenant,
        transient_id: created.transient_id,
        user_id: userId,
      }),
      200,
      promoteTransientPhoneDataSchema,
    );
    cleanup.leaveBehind('PII PHONE', `${tenant}/${userId}`);
    const afterPromote = await db.findTransientPhone(created.transient_id);
    noteAssumption('Q-25', 'Consumed mappings may be flagged or deleted; both accepted.');
    expect(
      afterPromote === undefined || afterPromote.is_consumed,
      'mapping consumed or removed after promotion',
    ).toBe(true);
    expect(await db.findPiiRecords(tenant, userId, 'PHONE')).toHaveLength(1);
  });

  test('PII-DB-006 A revoked encryption key is marked REVOKED and the key itself is not stored in readable form', async ({
    pii,
    db,
    tenant,
    cleanup,
  }) => {
    const created = await createKey(pii, cleanup, tenant);
    const active = await db.findFreeTextKey(created.key_id);
    expect(active?.tenant_id).toBe(tenant);
    expect(active?.status).toBe('ACTIVE');
    if (active?.encrypted_key_material !== undefined && active.encrypted_key_material !== null) {
      expectNotStoredAsPlaintext(active.encrypted_key_material, created.key, 'free-text key (base64 form)');
      const raw = asBuffer(active.encrypted_key_material);
      expect(raw.includes(Buffer.from(created.key, 'base64')), 'raw 32-byte key stored unwrapped').toBe(
        false,
      );
    } else {
      noteAssumption(
        'Q-16',
        'Catalog returns no encrypted_key_material column; at-rest key check not performed.',
      );
    }
    expectSuccess(
      await pii.revokeFreeTextKey({ tenant_id: tenant, key_id: created.key_id }),
      200,
      revokeFreeTextKeyDataSchema,
    );
    const revoked = await db.findFreeTextKey(created.key_id);
    expect(revoked?.status).toBe('REVOKED');
    expect(revoked?.revoked_at).toBeTruthy();
  });

  test('PII-DB-007 Each bulk read writes one audit record (PII_BATCH_READ)', async ({
    pii,
    db,
    data,
    tenant,
    cleanup,
  }) => {
    if (!db.has('findAuditEventsByRequestId')) {
      blockedBy(
        'Q-26',
        'Audit table schema and whether it stores X-Request-Id are undocumented; supply findAuditEventsByRequestId.',
      );
      return;
    }
    const userId = data.userId('db7');
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: data.email() });
    const res = await pii.batchReadPii({ tenant_id: tenant, user_ids: [userId], fields: ['EMAIL', 'NAME'] });
    expectSuccess(res, 200, batchReadDataSchema);
    const events = await db.findAuditEventsByRequestId(res.requestId);
    expect(events.filter((e) => e.event_type === 'PII_BATCH_READ')).toHaveLength(1);
  });
});
