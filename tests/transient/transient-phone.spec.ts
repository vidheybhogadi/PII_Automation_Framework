/**
 * Temporary (transient) phones through the Aisle facade: create → resolve → promote.
 * Runs with the approved test phones in AISLE_TEST_PHONES (blocked as CONFIG when none are set). Behaviour observed
 * on staging 2026-10-01; response format (BQ-02) and lifetime limits (BQ-28) still to be confirmed by Dev.
 */
import { randomUUID } from 'node:crypto';
import {
  expectError,
  expectNoData,
  expectStatus,
  expectSuccess,
  expectValidationError,
} from '../../src/assertions/response.assertions';
import {
  expectNoStore,
  expectResponseDoesNotEcho,
  expectSecretEquals,
} from '../../src/assertions/security.assertions';
import {
  BLOCKERS,
  createTransient,
  expectNotPersisted,
  readValue,
  seedField,
} from '../../src/fixtures/steps';
import {
  blockIfAccessDenied,
  expect,
  noteAssumption,
  noteObserved,
  onlyIfInScope,
  requireApprovedPhones,
  test,
} from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { LIMITS, PII_FIELDS, readPiiDataSchema } from '../../src/models/pii.models';
import {
  createTransientPhoneDataSchema,
  promoteTransientPhoneDataSchema,
  resolveTransientPhoneDataSchema,
} from '../../src/models/transient.models';

/** Lifetime used for temporary phones. The allowed range is not confirmed yet (BQ-02). */
const TTL_SECONDS = 900;
/** Shortest lifetime the service accepts (observed 2026-10-01: 300 → 201, 299 → 400; BQ-28). */
const SHORTEST_TTL_SECONDS = 300;
/** Extra wait after expires_at, so the expiry has certainly happened on the server. */
const EXPIRY_MARGIN_MS = 12_000;
/** The expiry tests wait ~5 minutes; they get 7 minutes in total. Tagged @slow. */
const SLOW_TEST_TIMEOUT_MS = 7 * 60_000;

/**
 * Wait until a temporary phone has expired: until its expires_at plus a small margin. Refuses to wait longer than
 * the shortest lifetime plus one minute, so a wrong expiry time fails clearly instead of hanging the run.
 */
async function waitUntilExpired(expiresAt: string): Promise<void> {
  const waitMs = Date.parse(expiresAt) - Date.now() + EXPIRY_MARGIN_MS;
  expect(waitMs, 'expiry time is within the shortest lifetime (plus a minute) from now').toBeLessThanOrEqual(
    (SHORTEST_TTL_SECONDS + 60) * 1000 + EXPIRY_MARGIN_MS,
  );
  await test.step(`wait ${Math.round(waitMs / 1000)} s for the temporary phone to expire`, async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitMs)));
  });
}

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

  test(
    'AISLE-TR-005 A temporary phone with the shortest lifetime can no longer be looked up after it expires (404)',
    { tag: ['@slow'] },
    async ({ aisle, data, config, cleanup }) => {
      requireApprovedPhones(config);
      test.setTimeout(SLOW_TEST_TIMEOUT_MS);
      noteObserved(
        '2026-10-05',
        'lifetime 300 s: resolve → 200 before expiry, 404 TRANSIENT_PHONE_NOT_FOUND after',
      );
      const created = await createTransient(aisle, {
        phone: data.phone(0).input,
        ttlSeconds: SHORTEST_TTL_SECONDS,
      });
      cleanup.leaveBehind('temporary phone', created.transient_id);
      expectSuccess(
        await aisle.resolveTransientPhone({ transient_id: created.transient_id }),
        200,
        resolveTransientPhoneDataSchema,
      );

      await waitUntilExpired(created.expires_at);

      const res = await aisle.resolveTransientPhone({ transient_id: created.transient_id });
      expectError(res, 404, ERROR_CODES.TRANSIENT_PHONE_NOT_FOUND);
      expectNoData(res);
    },
  );

  test('AISLE-TR-006 A lifetime of 0, a negative number or a huge number is refused; 300 seconds to 7 days is accepted', async ({
    aisle,
    data,
    config,
    cleanup,
  }) => {
    requireApprovedPhones(config);
    noteAssumption(
      'BQ-28',
      'observed 2026-10-01: ttl_seconds ≤ 0 → 422 (minimum 1); 1–299 and > 604,800 → 400 VALIDATION_ERROR; 300 and 604,800 → 201',
    );
    const phone = data.phone(0).input;
    const create = (ttl: number) => aisle.call('createTransientPhone', { phone, ttl_seconds: ttl });

    for (const ttl of [0, -1]) expectValidationError(await create(ttl), 'ttl_seconds');
    for (const ttl of [299, 604_801, 1_000_000_000]) {
      const res = await create(ttl);
      blockIfAccessDenied(res, BLOCKERS.transient.id, BLOCKERS.transient.reason);
      expectError(res, 400, ERROR_CODES.VALIDATION_ERROR);
      expectNoData(res);
    }
    for (const ttl of [300, 604_800]) {
      const created = expectSuccess(await create(ttl), 201, createTransientPhoneDataSchema);
      cleanup.leaveBehind('temporary phone', created.transient_id);
      const seconds = (Date.parse(created.expires_at) - Date.now()) / 1000;
      expect(Math.abs(seconds - ttl), `expiry is about ${ttl} s away`).toBeLessThan(60);
    }
  });

  test(
    'AISLE-TR-007 Promoting a temporary phone after it has expired is refused (404) and saves nothing',
    { tag: ['@slow'] },
    async ({ aisle, data, config, cleanup }) => {
      requireApprovedPhones(config);
      test.setTimeout(SLOW_TEST_TIMEOUT_MS);
      noteObserved(
        '2026-10-05',
        'lifetime 300 s: promote after expiry → 404 TRANSIENT_PHONE_NOT_FOUND; user PHONE → 404',
      );
      const userId = data.userId('tr7');
      const created = await createTransient(aisle, {
        phone: data.phone(1).input,
        ttlSeconds: SHORTEST_TTL_SECONDS,
      });
      cleanup.leaveBehind('temporary phone', created.transient_id);
      expectSuccess(
        await aisle.resolveTransientPhone({ transient_id: created.transient_id }),
        200,
        resolveTransientPhoneDataSchema,
      );

      await waitUntilExpired(created.expires_at);

      const res = await aisle.promoteTransientPhone({ transient_id: created.transient_id, user_id: userId });
      expectError(res, 404, ERROR_CODES.TRANSIENT_PHONE_NOT_FOUND);
      expectNoData(res);
      await expectNotPersisted(aisle, { userId, field: PII_FIELDS.PHONE });
    },
  );

  test('AISLE-TR-008 Promoting a temporary phone onto a user who already has a phone replaces that phone', async ({
    aisle,
    data,
    config,
    cleanup,
  }) => {
    requireApprovedPhones(config);
    noteObserved(
      '2026-10-01',
      'promote onto a user with a PHONE → 200, created false, consumed true; PHONE replaced; resolve → 404',
    );
    const [first, second] = [data.phone(0), data.phone(1)];
    const userId = data.userId('tr8');
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.PHONE, value: first.input });
    const created = await createTransient(aisle, { phone: second.input, ttlSeconds: TTL_SECONDS });

    const res = await aisle.promoteTransientPhone({ transient_id: created.transient_id, user_id: userId });
    blockIfAccessDenied(res, BLOCKERS.transient.id, BLOCKERS.transient.reason);
    const promoted = expectSuccess(res, 200, promoteTransientPhoneDataSchema);
    expect(promoted).toMatchObject({
      user_id: userId,
      field: PII_FIELDS.PHONE,
      created: false,
      consumed: true,
    });

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.PHONE }),
      second.normalized,
      'PHONE replaced by the promoted phone',
    );
    expectError(
      await aisle.resolveTransientPhone({ transient_id: created.transient_id }),
      404,
      ERROR_CODES.TRANSIENT_PHONE_NOT_FOUND,
    );
  });

  test('AISLE-TR-009 An invalid phone on create, or an invalid user ID on promote, is rejected and nothing is used up', async ({
    aisle,
    data,
    config,
    cleanup,
  }) => {
    requireApprovedPhones(config);
    noteObserved(
      '2026-10-01',
      'create with 5 / 16 digits or letters → 400 VALIDATION_ERROR; promote with "" / number / null / 129 characters → 422; the mapping stays usable',
    );
    // Made-up invalid phones only — never a number that could belong to a real person.
    for (const phone of ['12345', '1234567890123456', 'not-a-phone']) {
      const res = await aisle.call('createTransientPhone', { phone, ttl_seconds: TTL_SECONDS });
      blockIfAccessDenied(res, BLOCKERS.transient.id, BLOCKERS.transient.reason);
      expectError(res, 400, ERROR_CODES.VALIDATION_ERROR);
      expectNoData(res);
    }

    const created = await createTransient(aisle, { phone: data.phone(0).input, ttlSeconds: TTL_SECONDS });
    cleanup.leaveBehind('temporary phone', created.transient_id);
    for (const userId of ['', 123, null, data.userIdOfLength(LIMITS.userId.max + 1)]) {
      expectValidationError(
        await aisle.call('promoteTransientPhone', { transient_id: created.transient_id, user_id: userId }),
        'user_id',
      );
    }
    expectSuccess(
      await aisle.resolveTransientPhone({ transient_id: created.transient_id }),
      200,
      resolveTransientPhoneDataSchema,
    );
  });
});
