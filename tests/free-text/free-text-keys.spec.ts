/**
 * Free-text encryption keys through the Aisle facade: create → read → revoke.
 * BLOCKED today: every free-text-key call returns 403 (BQ-02). Response shapes, "no-store" and 404 behaviour
 * are not confirmed for the facade — recorded as assumptions. Keys are never logged or printed.
 */
import { randomUUID } from 'node:crypto';
import { expectStatus, expectSuccess } from '../../src/assertions/response.assertions';
import {
  expectNoSecretsIn,
  expectNoStore,
  expectSecretEquals,
} from '../../src/assertions/security.assertions';
import { BLOCKERS, createKey } from '../../src/fixtures/steps';
import { blockIfAccessDenied, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { freeTextKeyDataSchema, revokeFreeTextKeyDataSchema } from '../../src/models/free-text.models';
import { runInPhase } from '../../src/utils/phase';

test.describe('Aisle facade — free-text keys', () => {
  onlyIfInScope('createFreeTextKey', 'readFreeTextKey', 'revokeFreeTextKey');

  test('AISLE-FT-001 Creating a free-text encryption key returns a new 256-bit key, marked “do not cache”', async ({
    aisle,
    cleanup,
    log,
  }) => {
    const res = await aisle.createFreeTextKey({});
    blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
    noteAssumption(
      'BQ-02',
      'key response shape (256-bit AES-256-GCM key) and "no-store" — to be confirmed by Dev',
    );
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
    noteAssumption('BQ-02', 'read-key response shape and "no-store" — to be confirmed by Dev');
    const read = expectSuccess(res, 200, freeTextKeyDataSchema);
    expectSecretEquals(read.key, key.key, 'free-text key');
    expectNoStore(res);
  });

  test('AISLE-FT-003 A revoked key can no longer be read or revoked again (404), and unknown key IDs return 404', async ({
    aisle,
    cleanup,
  }) => {
    const key = await createKey(aisle, cleanup);

    const res = await aisle.revokeFreeTextKey({ key_id: key.key_id });
    blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
    noteAssumption(
      'BQ-02',
      'revoke response shape and 404 for revoked/unknown keys — to be confirmed by Dev',
    );
    expectSuccess(res, 200, revokeFreeTextKeyDataSchema);

    expectStatus(await aisle.readFreeTextKey({ key_id: key.key_id }), 404, 'read after revoke');
    expectStatus(await aisle.revokeFreeTextKey({ key_id: key.key_id }), 404, 'second revoke');
    expectStatus(await aisle.readFreeTextKey({ key_id: randomUUID() }), 404, 'unknown key ID');
  });
});
