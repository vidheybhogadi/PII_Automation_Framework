/**
 * Reusable test steps (setup actions shared by many specs). Each step asserts its own success so a setup
 * failure is reported as such, not as a confusing failure later in the test.
 *
 * Every step runs in a call phase (src/utils/phase.ts) so reports can tell seeding and verification calls
 * apart from the request under test.
 *
 * Access gates: a setup call answered with 403 AUTHORIZATION_DENIED marks the test BLOCKED (the Aisle caller
 * has not been given that access yet) instead of failing it. Pass `blocker` to name the open question.
 */
import { test } from '@playwright/test';
import { expectError, expectSuccess } from '../assertions/response.assertions';
import type { AislePiiClient } from '../clients/aisle-pii-client';
import { ERROR_CODES } from '../models/common.models';
import { freeTextKeyDataSchema, type FreeTextKeyData } from '../models/free-text.models';
import { writePiiDataSchema, type WritePiiData } from '../models/pii.models';
import { createTransientPhoneDataSchema, type CreateTransientPhoneData } from '../models/transient.models';
import type { CleanupRegistry } from '../utils/cleanup';
import { runInPhase } from '../utils/phase';
import { blockIfAccessDenied } from './test-fixtures';

export interface Blocker {
  /** Question ID in docs/backend-open-questions.md, e.g. 'BQ-01'. */
  id: string;
  /** Plain-English reason, e.g. 'EMAIL access not granted to the Aisle caller'. */
  reason: string;
}

/** Access blockers known today (403 AUTHORIZATION_DENIED on staging, 2026-09-29). */
export const BLOCKERS = {
  email: { id: 'BQ-01', reason: 'EMAIL access not granted to the Aisle caller' },
  search: { id: 'BQ-01', reason: 'EMAIL search access not granted to the Aisle caller' },
  transient: { id: 'BQ-02', reason: 'Temporary-phone access not granted to the Aisle caller' },
  freeText: { id: 'BQ-02', reason: 'Free-text key access not granted to the Aisle caller' },
  phone: { id: 'BQ-03', reason: 'PHONE access / approved test phones not available' },
} as const satisfies Record<string, Blocker>;

/**
 * Write one field for a user (expects 201 new / 200 replaced) and record it as test data that cannot be
 * deleted (there is no delete API).
 */
export async function seedField(
  aisle: AislePiiClient,
  cleanup: CleanupRegistry,
  args: { userId: string; field: string; value: string; blocker?: Blocker },
): Promise<WritePiiData> {
  return test.step(`seed ${args.field}`, () =>
    runInPhase('setup', async () => {
      const res = await aisle.writePii({ user_id: args.userId, field: args.field, value: args.value });
      if (args.blocker) blockIfAccessDenied(res, args.blocker.id, args.blocker.reason);
      const data = expectSuccess(res, [201, 200], writePiiDataSchema);
      cleanup.leaveBehind(`PII ${args.field}`, args.userId);
      return data;
    }));
}

/**
 * Prove a REJECTED request left nothing behind: reading the field must return 404 PII_NOT_FOUND
 * (observed on staging for a user with no saved value).
 */
export async function expectNotPersisted(
  aisle: AislePiiClient,
  args: { userId: string; field: string },
): Promise<void> {
  await test.step(`verify ${args.field} was not saved`, () =>
    runInPhase('verify', async () => {
      const res = await aisle.readPii({ user_id: args.userId, field_names: [args.field] });
      expectError(res, 404, ERROR_CODES.PII_NOT_FOUND);
    }));
}

/** Read one field and return its value (expects 200 and exactly one item). */
export async function readValue(
  aisle: AislePiiClient,
  args: { userId: string; field: string },
): Promise<string | undefined> {
  return test.step(`read ${args.field}`, () =>
    runInPhase('verify', async () => {
      const res = await aisle.readPii({ user_id: args.userId, field_names: [args.field] });
      const body = res.json() as { data?: { items?: { field?: string; value?: string }[] } } | undefined;
      if (res.status !== 200) throw new Error(`Reading ${args.field} failed: ${res.summary()}`);
      return body?.data?.items?.find((i) => i.field?.toUpperCase() === args.field.toUpperCase())?.value;
    }));
}

export async function createTransient(
  aisle: AislePiiClient,
  args: { phone: string; ttlSeconds: number },
): Promise<CreateTransientPhoneData> {
  return test.step('create temporary phone', () =>
    runInPhase('setup', async () => {
      const res = await aisle.createTransientPhone({ phone: args.phone, ttl_seconds: args.ttlSeconds });
      blockIfAccessDenied(res, BLOCKERS.transient.id, BLOCKERS.transient.reason);
      return expectSuccess(res, 201, createTransientPhoneDataSchema);
    }));
}

/** Create a free-text key and register its revocation (the one available clean-up API). */
export async function createKey(aisle: AislePiiClient, cleanup: CleanupRegistry): Promise<FreeTextKeyData> {
  return test.step('create free-text key', () =>
    runInPhase('setup', async () => {
      const res = await aisle.createFreeTextKey({});
      blockIfAccessDenied(res, BLOCKERS.freeText.id, BLOCKERS.freeText.reason);
      const data = expectSuccess(res, 201, freeTextKeyDataSchema);
      cleanup.register(`revoke free-text key ${data.key_id.slice(0, 8)}…`, () =>
        runInPhase('setup', async () => {
          const revoke = await aisle.revokeFreeTextKey({ key_id: data.key_id });
          // 404 = already revoked by the test itself; anything else is a real cleanup failure.
          if (revoke.status !== 200 && revoke.status !== 404)
            throw new Error(`revoke returned ${revoke.status}`);
        }),
      );
      return data;
    }));
}
