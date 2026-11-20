/**
 * Free-text encryption keys through the Aisle facade: create → read → revoke.
 * Access granted 2026-10-01; a 403 would still mark a test BLOCKED at runtime. Response shapes, "no-store" and
 * 404 behaviour are observed on staging (recorded as notes).
 * A second revoke is idempotent (200 REVOKED — Dev, ClickUp 14zmk4dk7yt). Keys are never logged or printed.
 */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import {
  expectError,
  expectStatus,
  expectSuccess,
  expectValidationError,
} from '../../src/assertions/response.assertions';
import {
  expectNoSecretsIn,
  expectNoStore,
  expectSecretEquals,
} from '../../src/assertions/security.assertions';
import { BLOCKERS, createKey } from '../../src/fixtures/steps';
import {
  blockIfAccessDenied,
  expect,
  noteAssumption,
  noteObserved,
  onlyIfInScope,
  test,
} from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { freeTextKeyDataSchema, revokeFreeTextKeyDataSchema } from '../../src/models/free-text.models';
import { runInPhase } from '../../../core/utils/phase';

test.describe('Aisle facade — free-text keys', () => {
  onlyIfInScope('createFreeTextKey', 'readFreeTextKey', 'revokeFreeTextKey');

  test('AISLE-FT-001 Creating a free-text encryption key returns a new 256-bit key, marked “do not cache”', async ({
    aisle,
    cleanup,
    log,
  }) => {
    const res = await aisle.createFreeTextKey({});
    blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
    noteObserved('2026-10-01', 'create → 201 with a 256-bit AES-256-GCM key and "Cache-Control: no-store"');
    const key = expectSuccess(res, 201, freeTextKeyDataSchema);
    cleanup.register('revoke free-text key', () =>
      runInPhase('setup', async () => {
        await aisle.revokeFreeTextKey({ key_id: key.key_id });
      }),
    );
    expectNoStore(res);
    expectNoSecretsIn(log.lines(), [key.key], 'api-calls.log');
  });

  test('AISLE-FT-002 Reading an active key returns the same key, marked “do not cache”', async ({
    aisle,
    cleanup,
  }) => {
    const key = await createKey(aisle, cleanup);

    const res = await aisle.readFreeTextKey({ key_id: key.key_id });
    blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
    noteObserved('2026-10-01', 'read → 200 with the same key and "Cache-Control: no-store"');
    const read = expectSuccess(res, 200, freeTextKeyDataSchema);
    expectSecretEquals(read.key, key.key, 'free-text key');
    expectNoStore(res);
  });

  test('AISLE-FT-003 A revoked free-text key can no longer be read (404), and a made-up key ID also returns 404', async ({
    aisle,
    cleanup,
  }) => {
    const key = await createKey(aisle, cleanup);

    const res = await aisle.revokeFreeTextKey({ key_id: key.key_id });
    blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
    noteObserved('2026-10-01', 'revoke → 200 REVOKED, read after revoke → 404, unknown key ID → 404');
    noteAssumption(
      'BQ-47',
      'revoking is expected to be how free text is erased (crypto-shredding) — to be confirmed by Dev',
    );
    expectSuccess(res, 200, revokeFreeTextKeyDataSchema);

    expectStatus(await aisle.readFreeTextKey({ key_id: key.key_id }), 404, 'read after revoke');
    expectStatus(await aisle.readFreeTextKey({ key_id: randomUUID() }), 404, 'unknown key ID');
  });

  test('AISLE-FT-004 Revoking a free-text key that is already revoked succeeds again (200 REVOKED)', async ({
    aisle,
    cleanup,
  }) => {
    noteObserved(
      '2026-11-19',
      'second revoke → 200 with status REVOKED (idempotent, Dev: ClickUp 14zmk4dk7yt); read after revoke → 404',
    );
    const key = await createKey(aisle, cleanup);

    const first = await aisle.revokeFreeTextKey({ key_id: key.key_id });
    blockIfAccessDenied(first, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
    expect(expectSuccess(first, 200, revokeFreeTextKeyDataSchema).status).toBe('REVOKED');

    const second = expectSuccess(
      await aisle.revokeFreeTextKey({ key_id: key.key_id }),
      200,
      revokeFreeTextKeyDataSchema,
    );
    expect(second.key_id).toBe(key.key_id);
    expect(second.status).toBe('REVOKED');

    expectStatus(await aisle.readFreeTextKey({ key_id: key.key_id }), 404, 'read after the second revoke');
  });

  test('AISLE-FT-005 Two keys created one after the other get different key IDs and different keys', async ({
    aisle,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'two creates → two different key IDs and keys');
    const first = await createKey(aisle, cleanup);
    const second = await createKey(aisle, cleanup);
    expect(first.key_id === second.key_id, 'key IDs differ').toBe(false);
    expect(first.key === second.key, 'keys differ (compared without printing them)').toBe(false);
  });

  test('AISLE-FT-006 Reading or revoking with a badly formed, empty or numeric key ID is rejected (422)', async ({
    aisle,
  }) => {
    noteObserved('2026-10-01', 'bad key_id → 422 uuid_parsing / uuid_type on read and revoke');
    for (const endpoint of ['readFreeTextKey', 'revokeFreeTextKey'] as const) {
      for (const body of [{ key_id: 'not-a-uuid' }, { key_id: '' }, { key_id: 123 }]) {
        const res = await aisle.call(endpoint, body);
        blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
        expectValidationError(res, 'key_id');
      }
    }
  });

  test('AISLE-FT-007 Revoking a key ID that never existed returns 404 “Free-text key not found”', async ({
    aisle,
  }) => {
    noteObserved('2026-10-01', 'revoke of a made-up key ID → 404 FREE_TEXT_KEY_NOT_FOUND');
    const res = await aisle.revokeFreeTextKey({ key_id: randomUUID() });
    blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
    const error = expectError(res, 404, ERROR_CODES.FREE_TEXT_KEY_NOT_FOUND);
    expect(error.message).toBe('Free-text key not found');
  });

  test('AISLE-FT-008 A free-text key from the service can encrypt a fake bio, and the same key read back by its ID decrypts it', async ({
    aisle,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'create → 201 and read → 200 return the same 256-bit AES-256-GCM key');
    const key = await createKey(aisle, cleanup);
    const bio = `QA automation fake bio ${randomUUID()}`;

    // Test-side encryption, as Aisle would do it: AES-256-GCM with a fresh random 12-byte nonce.
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key.key, 'base64'), nonce);
    const encrypted = Buffer.concat([cipher.update(bio, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const res = await aisle.readFreeTextKey({ key_id: key.key_id });
    blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
    const reread = expectSuccess(res, 200, freeTextKeyDataSchema);

    let decrypted: string | undefined;
    try {
      const decipher = createDecipheriv('aes-256-gcm', Buffer.from(reread.key, 'base64'), nonce);
      decipher.setAuthTag(tag);
      decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      decrypted = undefined; // wrong key or tampered data: the tamper seal is rejected
    }
    expect(decrypted !== undefined, 'decrypting with the re-read key succeeds (tamper seal accepted)').toBe(
      true,
    );
    expectSecretEquals(decrypted, bio, 'decrypted fake bio');
  });
});
