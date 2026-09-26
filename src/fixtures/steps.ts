/**
 * Reusable test steps (setup actions shared by many specs). Each step asserts its own success so a setup
 * failure is reported as such, not as a confusing failure later in the test.
 *
 * Every step runs in a call phase (src/utils/phase.ts) so reports can tell seeding and verification calls
 * apart from the request under test.
 */
import { test } from '@playwright/test';
import { expectError, expectSuccess } from '../assertions/response.assertions';
import type { PiiClient } from '../clients/pii-client';
import { ERROR_CODES } from '../models/common.models';
import { freeTextKeyDataSchema, type FreeTextKeyData } from '../models/free-text.models';
import { writePiiDataSchema, type WritePiiData } from '../models/pii.models';
import { createTransientPhoneDataSchema, type CreateTransientPhoneData } from '../models/transient.models';
import type { CleanupRegistry } from '../utils/cleanup';
import { runInPhase } from '../utils/phase';

/** Write one field for a NEW user (expects 201) and record it as un-deletable test data. */
export async function seedField(
  pii: PiiClient,
  cleanup: CleanupRegistry,
  args: { tenant: string; userId: string; field: string; value: string },
): Promise<WritePiiData> {
  return test.step(`seed ${args.field}`, () =>
    runInPhase('setup', async () => {
      const res = await pii.writePii({
        tenant_id: args.tenant,
        user_id: args.userId,
        field: args.field,
        value: args.value,
      });
      const data = expectSuccess(res, [201, 200], writePiiDataSchema);
      cleanup.leaveBehind(`PII ${args.field}`, `${args.tenant}/${args.userId}`);
      return data;
    }));
}

/**
 * Prove a REJECTED write left nothing behind: a valid, correctly signed read must return 404 PII_NOT_FOUND.
 * Used after every negative write so "rejected" really means "not processed".
 */
export async function expectNotPersisted(
  pii: PiiClient,
  args: { tenant: string; userId: string; field: string },
): Promise<void> {
  await test.step(`verify ${args.field} was not persisted`, () =>
    runInPhase('verify', async () => {
      const res = await pii.readPii({
        tenant_id: args.tenant,
        user_id: args.userId,
        field_names: [args.field],
      });
      expectError(res, 404, ERROR_CODES.PII_NOT_FOUND);
    }));
}

/** Write several fields for one user. */
export async function seedUser(
  pii: PiiClient,
  cleanup: CleanupRegistry,
  tenant: string,
  userId: string,
  fields: Record<string, string>,
): Promise<void> {
  for (const [field, value] of Object.entries(fields)) {
    await seedField(pii, cleanup, { tenant, userId, field, value });
  }
}

export async function createTransient(
  pii: PiiClient,
  args: { tenant: string; phone: string; ttlSeconds: number },
): Promise<CreateTransientPhoneData> {
  return test.step('create transient phone', () =>
    runInPhase('setup', async () => {
      const res = await pii.createTransientPhone({
        tenant_id: args.tenant,
        phone: args.phone,
        ttl_seconds: args.ttlSeconds,
      });
      return expectSuccess(res, 201, createTransientPhoneDataSchema);
    }));
}

/** Create a free-text key and register its revocation (the one approved cleanup API). */
export async function createKey(
  pii: PiiClient,
  cleanup: CleanupRegistry,
  tenant: string,
): Promise<FreeTextKeyData> {
  return test.step('create free-text key', () =>
    runInPhase('setup', async () => {
      const res = await pii.createFreeTextKey({ tenant_id: tenant });
      const data = expectSuccess(res, 201, freeTextKeyDataSchema);
      cleanup.register(`revoke free-text key ${data.key_id.slice(0, 8)}…`, () =>
        runInPhase('setup', async () => {
          const revoke = await pii.revokeFreeTextKey({ tenant_id: tenant, key_id: data.key_id });
          // 404 = already revoked by the test itself; anything else is a real cleanup failure.
          if (revoke.status !== 200 && revoke.status !== 404)
            throw new Error(`revoke returned ${revoke.status}`);
        }),
      );
      return data;
    }));
}
