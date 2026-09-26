/**
 * Guide §9–11 — free-text key create / read / revoke.
 * The raw key is compared only via fingerprints and is never logged (see FT-010).
 */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import {
  expectError,
  expectRequestValidationError,
  expectSuccess,
} from '../../src/assertions/response.assertions';
import {
  expectNoSecretsIn,
  expectNoStore,
  expectSecretEquals,
  expectSecretNotEquals,
} from '../../src/assertions/security.assertions';
import { createKey } from '../../src/fixtures/steps';
import { expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { freeTextKeyDataSchema, revokeFreeTextKeyDataSchema } from '../../src/models/free-text.models';

const NOT_FOUND = ERROR_CODES.FREE_TEXT_KEY_NOT_FOUND;

test.describe('Free-text key lifecycle', { tag: ['@regression'] }, () => {
  onlyIfInScope('createFreeTextKey', 'readFreeTextKey', 'revokeFreeTextKey');

  test(
    'PII-FT-001 Creating an encryption key returns 201 and an active 256-bit AES-256-GCM key that must not be cached',
    { tag: '@smoke' },
    async ({ pii, tenant, cleanup }) => {
      const res = await pii.createFreeTextKey({ tenant_id: tenant });
      // Schema checks: key_id UUID, key = canonical Base64 of exactly 32 bytes, algorithm/status literals, ISO created_at.
      const key = expectSuccess(res, 201, freeTextKeyDataSchema, 'Free-text key created');
      cleanup.register(
        'revoke key (FT-001)',
        async () => void (await pii.revokeFreeTextKey({ tenant_id: tenant, key_id: key.key_id })),
      );
      expectNoStore(res);
      expect(key).toMatchObject({ tenant_id: tenant, algorithm: 'AES-256-GCM', status: 'ACTIVE' });
      expect(Buffer.from(key.key, 'base64')).toHaveLength(32);
    },
  );

  test('PII-FT-002 Reading an active key returns the same key, marked as not to be cached', async ({
    pii,
    tenant,
    cleanup,
  }) => {
    const created = await createKey(pii, cleanup, tenant);
    const res = await pii.readFreeTextKey({ tenant_id: tenant, key_id: created.key_id });
    const read = expectSuccess(res, 200, freeTextKeyDataSchema, 'Free-text key read');
    expectNoStore(res);
    expect(read).toMatchObject({
      tenant_id: tenant,
      key_id: created.key_id,
      status: 'ACTIVE',
      algorithm: 'AES-256-GCM',
    });
    expect(Date.parse(read.created_at)).toBe(Date.parse(created.created_at));
    expectSecretEquals(read.key, created.key, 'free-text key material');
  });

  test(
    'PII-FT-003 Revoking a key marks it REVOKED with a time, and it can no longer be read',
    { tag: '@smoke' },
    async ({ pii, tenant, cleanup }) => {
      const created = await createKey(pii, cleanup, tenant);
      const revoked = expectSuccess(
        await pii.revokeFreeTextKey({ tenant_id: tenant, key_id: created.key_id }),
        200,
        revokeFreeTextKeyDataSchema,
        'Free-text key revoked',
      );
      expect(revoked).toMatchObject({ tenant_id: tenant, key_id: created.key_id, status: 'REVOKED' });
      expect(Date.parse(revoked.revoked_at)).toBeGreaterThanOrEqual(Date.parse(created.created_at));
      expectError(await pii.readFreeTextKey({ tenant_id: tenant, key_id: created.key_id }), 404, NOT_FOUND);
    },
  );

  test('PII-FT-004 Revoking a key that is already revoked returns 404', async ({ pii, tenant, cleanup }) => {
    noteAssumption('A-06', 'Derived from the error table: FREE_TEXT_KEY_NOT_FOUND covers "revoked" keys.');
    const created = await createKey(pii, cleanup, tenant);
    expectSuccess(
      await pii.revokeFreeTextKey({ tenant_id: tenant, key_id: created.key_id }),
      200,
      revokeFreeTextKeyDataSchema,
    );
    expectError(await pii.revokeFreeTextKey({ tenant_id: tenant, key_id: created.key_id }), 404, NOT_FOUND);
  });

  test('PII-FT-005 A different caller cannot read or revoke the key (404), and the key stays active', async ({
    pii,
    piiAs,
    tenant,
    cleanup,
  }) => {
    const other = piiAs('secondary');
    const created = await createKey(pii, cleanup, tenant);
    expectError(await other.readFreeTextKey({ tenant_id: tenant, key_id: created.key_id }), 404, NOT_FOUND);
    expectError(await other.revokeFreeTextKey({ tenant_id: tenant, key_id: created.key_id }), 404, NOT_FOUND);
    expectSuccess(
      await pii.readFreeTextKey({ tenant_id: tenant, key_id: created.key_id }),
      200,
      freeTextKeyDataSchema,
    );
  });

  test('PII-FT-006 The key cannot be read or revoked through a different tenant (404)', async ({
    pii,
    data,
    tenant,
    cleanup,
  }) => {
    const created = await createKey(pii, cleanup, tenant);
    const otherTenant = data.secondaryTenant();
    expectError(
      await pii.readFreeTextKey({ tenant_id: otherTenant, key_id: created.key_id }),
      404,
      NOT_FOUND,
    );
    expectError(
      await pii.revokeFreeTextKey({ tenant_id: otherTenant, key_id: created.key_id }),
      404,
      NOT_FOUND,
    );
  });

  test('PII-FT-007 Unknown key ID returns 404; a badly formed key ID or missing tenant returns 422', async ({
    pii,
    tenant,
  }) => {
    expectError(await pii.readFreeTextKey({ tenant_id: tenant, key_id: randomUUID() }), 404, NOT_FOUND);
    expectRequestValidationError(await pii.readFreeTextKey({ tenant_id: tenant, key_id: 'not-a-uuid' }));
    expectRequestValidationError(await pii.call('createFreeTextKey', {}));
  });

  test('PII-FT-008 Every new key gets its own ID and its own key value', async ({ pii, tenant, cleanup }) => {
    const a = await createKey(pii, cleanup, tenant);
    const b = await createKey(pii, cleanup, tenant);
    expect(a.key_id).not.toBe(b.key_id);
    expectSecretNotEquals(a.key, b.key, 'two generated keys');
  });

  test('PII-FT-009 The returned key really works to encrypt and decrypt data (AES-256-GCM)', async ({
    pii,
    tenant,
    cleanup,
  }) => {
    const created = await createKey(pii, cleanup, tenant);
    const key = Buffer.from(created.key, 'base64');
    const nonce = randomBytes(12); // fresh nonce per encryption — never reuse with the same key
    const plaintext = Buffer.from('synthetic free text for automation', 'utf8');
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    expect(Buffer.concat([decipher.update(ciphertext), decipher.final()]).equals(plaintext)).toBe(true);
  });

  test(
    'PII-FT-010 Key values never appear in logs or report files',
    { tag: '@security' },
    async ({ pii, tenant, cleanup, log }) => {
      const created = await createKey(pii, cleanup, tenant);
      const read = expectSuccess(
        await pii.readFreeTextKey({ tenant_id: tenant, key_id: created.key_id }),
        200,
        freeTextKeyDataSchema,
      );
      expectNoSecretsIn(log.lines(), [created.key, read.key], 'api-calls.log');
      expectNoSecretsIn([JSON.stringify(test.info().annotations)], [created.key], 'annotations');
    },
  );
});
