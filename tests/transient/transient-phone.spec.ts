/**
 * Temporary (transient) phones through the Aisle facade: create → resolve → promote.
 * BLOCKED today: no approved test phones (BQ-03) and every temporary-phone call returns 403 (BQ-02).
 * Response shapes and 404/422 behaviour are not confirmed for the facade — recorded as assumptions.
 */
import { randomUUID } from 'node:crypto';
import { expectStatus, expectSuccess, expectValidationError } from '../../src/assertions/response.assertions';
import {
  expectNoStore,
  expectResponseDoesNotEcho,
  expectSecretEquals,
} from '../../src/assertions/security.assertions';
import { BLOCKERS, createTransient } from '../../src/fixtures/steps';
import {
  blockedBy,
  blockIfAccessDenied,
  noteAssumption,
  onlyIfInScope,
  requireApprovedPhones,
  test,
  expect,
} from '../../src/fixtures/test-fixtures';
import { PII_FIELDS, readPiiDataSchema } from '../../src/models/pii.models';
import {
  createTransientPhoneDataSchema,
  promoteTransientPhoneDataSchema,
  resolveTransientPhoneDataSchema,
} from '../../src/models/transient.models';

/** Lifetime used for temporary phones. The allowed range is not confirmed yet (BQ-02). */
const TTL_SECONDS = 900;

test.describe('Aisle facade — temporary phones', () => {
  onlyIfInScope('createTransientPhone', 'resolveTransientPhone', 'promoteTransientPhone');

  test('AISLE-TR-001 Creating a temporary phone returns an ID and an expiry time (201)', async ({
    aisle,
    data,
    config,
    cleanup,
  }) => {
    requireApprovedPhones(config);
    const phone = data.phone(0);

    const res = await aisle.createTransientPhone({ phone: phone.input, ttl_seconds: TTL_SECONDS });
    blockIfAccessDenied(res, BLOCKERS.transient.id, BLOCKERS.transient.reason);
    noteAssumption(
      'BQ-02',
      `create response shape and a ${TTL_SECONDS}-second lifetime — to be confirmed by Dev`,
    );
    const created = expectSuccess(res, 201, createTransientPhoneDataSchema);
    cleanup.leaveBehind('temporary phone', created.transient_id);
    expect(Date.parse(created.expires_at)).toBeGreaterThan(Date.now());
    expectResponseDoesNotEcho(res, phone.normalized);
  });

  test('AISLE-TR-002 Looking up a temporary phone returns the cleaned phone and says “do not cache”', async ({
    aisle,
    data,
    config,
    cleanup,
  }) => {
    requireApprovedPhones(config);
    const phone = data.phone(0);
    const created = await createTransient(aisle, { phone: phone.input, ttlSeconds: TTL_SECONDS });
    cleanup.leaveBehind('temporary phone', created.transient_id);

    const res = await aisle.resolveTransientPhone({ transient_id: created.transient_id });
    blockIfAccessDenied(res, BLOCKERS.transient.id, BLOCKERS.transient.reason);
    noteAssumption('BQ-02', 'resolve response shape and "Cache-Control: no-store" — to be confirmed by Dev');
    const resolved = expectSuccess(res, 200, resolveTransientPhoneDataSchema);
    expect(resolved.transient_id).toBe(created.transient_id);
    expectSecretEquals(resolved.phone, phone.normalized, 'resolved phone (digits only)');
    expectNoStore(res);
  });

  test('AISLE-TR-003 Promoting a temporary phone saves it as the user’s phone and uses the mapping up', async ({
    aisle,
    data,
    config,
    cleanup,
  }) => {
    requireApprovedPhones(config);
    const phone = data.phone(0);
    const userId = data.userId('tr3');
    const created = await createTransient(aisle, { phone: phone.input, ttlSeconds: TTL_SECONDS });

    const res = await aisle.promoteTransientPhone({ transient_id: created.transient_id, user_id: userId });
    blockIfAccessDenied(res, BLOCKERS.transient.id, BLOCKERS.transient.reason);
    cleanup.leaveBehind('PII PHONE', userId);
    noteAssumption('BQ-02', 'promote response shape and 404 after use — to be confirmed by Dev');
    const promoted = expectSuccess(res, 200, promoteTransientPhoneDataSchema);
    expect(promoted).toMatchObject({ user_id: userId, field: PII_FIELDS.PHONE });

    const read = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.PHONE] });
    blockIfAccessDenied(read, BLOCKERS.phone.id, BLOCKERS.phone.reason);
    const readData = expectSuccess(read, 200, readPiiDataSchema);
    expectSecretEquals(readData.items[0]?.value, phone.normalized, 'promoted PHONE');

    expectStatus(
      await aisle.resolveTransientPhone({ transient_id: created.transient_id }),
      404,
      'resolve after promote',
    );
    expectStatus(
      await aisle.promoteTransientPhone({ transient_id: created.transient_id, user_id: userId }),
      404,
      'second promote',
    );
  });

  test('AISLE-TR-004 An unknown temporary ID returns 404; a badly formed ID returns 422', async ({
    aisle,
    config,
  }) => {
    requireApprovedPhones(config);
    const unknown = await aisle.resolveTransientPhone({ transient_id: randomUUID() });
    blockIfAccessDenied(unknown, BLOCKERS.transient.id, BLOCKERS.transient.reason);
    noteAssumption('BQ-02', 'unknown ID → 404 and malformed ID → 422 — to be confirmed by Dev');
    expectStatus(unknown, 404, 'unknown temporary ID');

    const malformed = await aisle.resolveTransientPhone({ transient_id: 'not-a-valid-id' });
    expectValidationError(malformed, 'transient_id');
  });

  test('AISLE-TR-005 A temporary phone with a short lifetime can no longer be looked up after it expires (404)', async () => {
    blockedBy(
      'BQ-03',
      'Needs approved test phone numbers; expiry behaviour also depends on the lifetime rules (BQ-28)',
    );
  });

  test('AISLE-TR-006 A lifetime of 0, a negative number or a huge number is handled by a clear rule', async () => {
    blockedBy(
      'BQ-28',
      'The allowed lifetime (ttl_seconds) range is unknown, and approved test phones are missing (BQ-03)',
    );
  });

  test('AISLE-TR-007 Promoting a temporary phone after it has expired is refused and saves nothing', async () => {
    blockedBy('BQ-03', 'Needs approved test phone numbers; the refusal status is not yet observed');
  });

  test('AISLE-TR-008 Promoting a temporary phone onto a user who already has a phone replaces that phone', async () => {
    blockedBy('BQ-03', 'Needs approved test phone numbers; replace-versus-refuse is not yet observed');
  });

  test('AISLE-TR-009 An invalid phone on create, or an invalid user ID on promote, is rejected (422)', async () => {
    blockedBy('BQ-03', 'Temporary phones are not probed until approved test phone numbers exist');
  });
});
