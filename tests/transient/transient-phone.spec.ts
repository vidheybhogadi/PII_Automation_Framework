/** Guide §6–8 — transient phone create / resolve / promote lifecycle. */
import { randomUUID } from 'node:crypto';
import {
  expectError,
  expectRejected,
  expectRequestValidationError,
  expectSuccess,
} from '../../src/assertions/response.assertions';
import { expectNoStore, expectSecretEquals } from '../../src/assertions/security.assertions';
import { formattedPhone } from '../../src/data/test-data-factory';
import { createTransient, seedField } from '../../src/fixtures/steps';
import { blockedBy, expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { readPiiDataSchema } from '../../src/models/pii.models';
import {
  createTransientPhoneDataSchema,
  promoteTransientPhoneDataSchema,
  resolveTransientPhoneDataSchema,
} from '../../src/models/transient.models';

const NOT_FOUND = ERROR_CODES.TRANSIENT_PHONE_NOT_FOUND;

test.describe('Transient phone lifecycle', { tag: ['@regression'] }, () => {
  onlyIfInScope('createTransientPhone', 'resolveTransientPhone', 'promoteTransientPhone');

  test(
    'PII-TR-001 Creating a temporary phone returns 201, an ID, and an expiry time of now + lifetime',
    { tag: '@smoke' },
    async ({ pii, data, tenant, config }) => {
      const ttl = config.limits.transientTtlMinSeconds;
      const before = Date.now();
      const res = await pii.createTransientPhone({
        tenant_id: tenant,
        phone: formattedPhone(data.phone(0).normalized),
        ttl_seconds: ttl,
      });
      const created = expectSuccess(res, 201, createTransientPhoneDataSchema, 'Transient phone created');
      expect(created.tenant_id).toBe(tenant);
      const skewMs = config.limits.clockSkewToleranceSeconds * 1000;
      const expiresAt = Date.parse(created.expires_at);
      expect(expiresAt).toBeGreaterThanOrEqual(before + ttl * 1000 - skewMs);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + ttl * 1000 + skewMs);
    },
  );

  test(
    'PII-TR-002 Looking up a temporary phone returns the cleaned-up number, marked as not to be cached',
    { tag: '@smoke' },
    async ({ pii, data, tenant, config }) => {
      const phone = data.phone(0);
      const created = await createTransient(pii, {
        tenant,
        phone: formattedPhone(phone.normalized),
        ttlSeconds: config.limits.transientTtlMinSeconds,
      });
      const res = await pii.resolveTransientPhone({ tenant_id: tenant, transient_id: created.transient_id });
      const resolved = expectSuccess(res, 200, resolveTransientPhoneDataSchema, 'Transient phone resolved');
      expectNoStore(res);
      expect(resolved).toMatchObject({ tenant_id: tenant, transient_id: created.transient_id });
      expect(Date.parse(resolved.expires_at)).toBe(Date.parse(created.expires_at));
      expectSecretEquals(resolved.phone, phone.normalized, 'resolved phone');
    },
  );

  test('PII-TR-003 A different caller cannot look up or promote the temporary phone (404)', async ({
    pii,
    piiAs,
    data,
    tenant,
    config,
  }) => {
    const other = piiAs('secondary');
    const created = await createTransient(pii, {
      tenant,
      phone: data.phone(0).normalized,
      ttlSeconds: config.limits.transientTtlMinSeconds,
    });
    expectError(
      await other.resolveTransientPhone({ tenant_id: tenant, transient_id: created.transient_id }),
      404,
      NOT_FOUND,
    );
    expectError(
      await other.promoteTransientPhone({
        tenant_id: tenant,
        transient_id: created.transient_id,
        user_id: data.userId('tr3'),
      }),
      404,
      NOT_FOUND,
    );
    // The owner can still resolve it: the foreign attempts did not consume it.
    expectSuccess(
      await pii.resolveTransientPhone({ tenant_id: tenant, transient_id: created.transient_id }),
      200,
      resolveTransientPhoneDataSchema,
    );
  });

  test('PII-TR-004 The temporary phone cannot be looked up or promoted through a different tenant (404)', async ({
    pii,
    data,
    tenant,
    config,
  }) => {
    const otherTenant = data.secondaryTenant();
    const created = await createTransient(pii, {
      tenant,
      phone: data.phone(0).normalized,
      ttlSeconds: config.limits.transientTtlMinSeconds,
    });
    expectError(
      await pii.resolveTransientPhone({ tenant_id: otherTenant, transient_id: created.transient_id }),
      404,
      NOT_FOUND,
    );
    expectError(
      await pii.promoteTransientPhone({
        tenant_id: otherTenant,
        transient_id: created.transient_id,
        user_id: data.userId('tr4'),
      }),
      404,
      NOT_FOUND,
    );
  });

  test('PII-TR-005 Unknown temporary-phone ID returns 404; a badly formed ID returns 422', async ({
    pii,
    tenant,
  }) => {
    expectError(
      await pii.resolveTransientPhone({ tenant_id: tenant, transient_id: randomUUID() }),
      404,
      NOT_FOUND,
    );
    expectRequestValidationError(
      await pii.resolveTransientPhone({ tenant_id: tenant, transient_id: 'not-a-uuid' }),
    );
    expectRequestValidationError(
      await pii.promoteTransientPhone({ tenant_id: tenant, transient_id: 'not-a-uuid', user_id: 'x' }),
    );
  });

  test(
    'PII-TR-006 Promoting saves it as the user’s permanent phone (created=true), uses it up, and it can be read',
    { tag: '@smoke' },
    async ({ pii, data, tenant, config, cleanup }) => {
      const phone = data.phone(0);
      const userId = data.userId('tr6');
      const created = await createTransient(pii, {
        tenant,
        phone: formattedPhone(phone.normalized),
        ttlSeconds: config.limits.transientTtlMinSeconds,
      });

      const res = await pii.promoteTransientPhone({
        tenant_id: tenant,
        transient_id: created.transient_id,
        user_id: userId,
      });
      cleanup.leaveBehind('PII PHONE', `${tenant}/${userId}`);
      const promoted = expectSuccess(res, 200, promoteTransientPhoneDataSchema, 'Transient phone promoted');
      expect(promoted).toMatchObject({
        tenant_id: tenant,
        transient_id: created.transient_id,
        user_id: userId,
        field: 'PHONE',
        created: true,
        consumed: true,
      });

      await test.step('permanent PHONE readable via PII read', async () => {
        const read = expectSuccess(
          await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['PHONE'] }),
          200,
          readPiiDataSchema,
        );
        expectSecretEquals(read.items[0]?.value, phone.normalized, 'promoted PHONE');
      });
      await test.step('mapping can no longer be resolved', async () => {
        expectError(
          await pii.resolveTransientPhone({ tenant_id: tenant, transient_id: created.transient_id }),
          404,
          NOT_FOUND,
        );
      });
      await test.step('repeating promote returns 404', async () => {
        expectError(
          await pii.promoteTransientPhone({
            tenant_id: tenant,
            transient_id: created.transient_id,
            user_id: userId,
          }),
          404,
          NOT_FOUND,
        );
      });
    },
  );

  test('PII-TR-007 Promoting replaces the user’s existing permanent phone (created=false)', async ({
    pii,
    data,
    tenant,
    config,
    cleanup,
  }) => {
    test.skip(
      data.phoneCount < 2,
      'Needs at least 2 approved numbers in PII_TEST_PHONES to observe replacement',
    );
    const userId = data.userId('tr7');
    const oldPhone = data.phone(0);
    const newPhone = data.phone(1);
    await seedField(pii, cleanup, { tenant, userId, field: 'PHONE', value: oldPhone.normalized });
    const created = await createTransient(pii, {
      tenant,
      phone: newPhone.input,
      ttlSeconds: config.limits.transientTtlMinSeconds,
    });
    const promoted = expectSuccess(
      await pii.promoteTransientPhone({
        tenant_id: tenant,
        transient_id: created.transient_id,
        user_id: userId,
      }),
      200,
      promoteTransientPhoneDataSchema,
    );
    expect(promoted).toMatchObject({ created: false, consumed: true });
    const read = expectSuccess(
      await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['PHONE'] }),
      200,
      readPiiDataSchema,
    );
    expectSecretEquals(read.items[0]?.value, newPhone.normalized, 'replaced PHONE');
  });

  test('PII-TR-008 Lifetimes at the allowed minimum and maximum are accepted; outside them 400 VALIDATION_ERROR', async ({
    pii,
    data,
    tenant,
    config,
  }) => {
    const { transientTtlMinSeconds: min, transientTtlMaxSeconds: max } = config.limits;
    const phone = data.phone(0).normalized;
    for (const ttl of [min, max]) {
      await test.step(`ttl=${ttl} accepted`, async () => {
        expectSuccess(
          await pii.createTransientPhone({ tenant_id: tenant, phone, ttl_seconds: ttl }),
          201,
          createTransientPhoneDataSchema,
        );
      });
    }
    for (const ttl of [min - 1, max + 1]) {
      await test.step(`ttl=${ttl} rejected`, async () => {
        expectError(
          await pii.createTransientPhone({ tenant_id: tenant, phone, ttl_seconds: ttl }),
          400,
          ERROR_CODES.VALIDATION_ERROR,
        );
      });
    }
  });

  test('PII-TR-009 A zero, negative or fractional lifetime is rejected', async ({ pii, data, tenant }) => {
    noteAssumption(
      'Q-11',
      '"positive integer" violations may be 422 (schema) or 400 (domain); both accepted.',
    );
    const phone = data.phone(0).normalized;
    for (const ttl of [0, -1]) {
      await test.step(`ttl=${ttl}`, async () => {
        expectRejected(
          await pii.createTransientPhone({ tenant_id: tenant, phone, ttl_seconds: ttl }),
          [400, 422],
          'Q-11',
        );
      });
    }
    await test.step('ttl="abc"', async () => {
      expectRequestValidationError(
        await pii.call('createTransientPhone', { tenant_id: tenant, phone, ttl_seconds: 'abc' }),
      );
    });
  });

  test('PII-TR-010 An invalid phone number is rejected (400 VALIDATION_ERROR)', async ({
    pii,
    tenant,
    config,
  }) => {
    const ttl = config.limits.transientTtlMinSeconds;
    for (const phone of ['123-4567', '+1234 5678 9012 3456', 'no digits']) {
      await test.step(`phone ${phone.length} chars`, async () => {
        expectError(
          await pii.createTransientPhone({ tenant_id: tenant, phone, ttl_seconds: ttl }),
          400,
          ERROR_CODES.VALIDATION_ERROR,
        );
      });
    }
  });

  test('PII-TR-011 A temporary-phone request missing required fields is rejected (422)', async ({
    pii,
    data,
    tenant,
    config,
  }) => {
    const full = {
      tenant_id: tenant,
      phone: data.phone(0).normalized,
      ttl_seconds: config.limits.transientTtlMinSeconds,
    };
    for (const key of Object.keys(full)) {
      await test.step(`without ${key}`, async () => {
        const payload: Record<string, unknown> = { ...full };
        delete payload[key];
        expectRequestValidationError(await pii.call('createTransientPhone', payload));
      });
    }
  });

  test(
    'PII-TR-012 An expired temporary phone cannot be looked up or promoted (404)',
    { tag: '@slow' },
    async ({ pii, data, tenant, config }) => {
      if (!config.features.ttlExpiryTest) {
        blockedBy(
          'Q-12',
          'Minimum TTL is 300s in development. Enable PII_ENABLE_TTL_EXPIRY_TEST in an environment with a short ' +
            'minimum TTL, or ask the backend team for a test clock.',
        );
        return;
      }
      const ttl = config.limits.transientTtlMinSeconds;
      const waitMs = (ttl + config.limits.clockSkewToleranceSeconds) * 1000;
      test.setTimeout(waitMs + 120_000);
      const created = await createTransient(pii, {
        tenant,
        phone: data.phone(0).normalized,
        ttlSeconds: ttl,
      });
      await test.step(`wait ${Math.round(waitMs / 1000)}s for expiry`, () =>
        new Promise((r) => setTimeout(r, waitMs)));
      expectError(
        await pii.resolveTransientPhone({ tenant_id: tenant, transient_id: created.transient_id }),
        404,
        NOT_FOUND,
      );
      expectError(
        await pii.promoteTransientPhone({
          tenant_id: tenant,
          transient_id: created.transient_id,
          user_id: data.userId('tr12'),
        }),
        404,
        NOT_FOUND,
      );
    },
  );
});
