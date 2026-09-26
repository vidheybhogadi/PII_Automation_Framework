/** Response-level security controls and PII-hygiene checks. */
import { expectError } from '../../src/assertions/response.assertions';
import { expectNoSecretsIn, expectResponseDoesNotEcho } from '../../src/assertions/security.assertions';
import { serializeBody } from '../../src/clients/base-api-client';
import { formattedPhone } from '../../src/data/test-data-factory';
import { createKey, createTransient, seedField } from '../../src/fixtures/steps';
import { blockedBy, expect, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';

test.describe('Response security', { tag: ['@security', '@regression'] }, () => {
  onlyIfInScope('writePii', 'readPii');

  test('PII-SEC-001 Error messages never repeat the personal value that was sent', async ({
    pii,
    data,
    tenant,
  }) => {
    noteAssumption(
      'P-01',
      'Security policy expectation (not stated in the guide): error bodies must not echo submitted PII.',
    );
    const badEmail = `qa-${data.runId}-invalid-email-value`;
    const res = await pii.writePii({
      tenant_id: tenant,
      user_id: data.userId('sec1'),
      field: 'EMAIL',
      value: badEmail,
    });
    expectError(res, 400, ERROR_CODES.VALIDATION_ERROR);
    expectResponseDoesNotEcho(res, badEmail);
  });

  test('PII-SEC-002 A request body over the size limit is rejected (413 BODY_TOO_LARGE)', async ({
    pii,
    data,
    tenant,
    config,
  }) => {
    const max = config.limits.maxBodyBytes;
    if (!max) {
      blockedBy(
        'Q-22',
        'Configured maximum body size is undocumented; set PII_MAX_BODY_BYTES for this environment.',
      );
      return;
    }
    const base = { tenant_id: tenant, user_id: data.userId('sec2'), field: 'NAME', value: '' };
    const overhead = serializeBody(base).length;
    const oversized = { ...base, value: 'x'.repeat(max - overhead + 1) };
    expect(serializeBody(oversized).length).toBe(max + 1);
    expectError(await pii.writePii(oversized, { retry: false }), 413, ERROR_CODES.BODY_TOO_LARGE);
  });

  test('PII-SEC-003 The development-only signing helper (/docs/signature) is switched off', async ({
    pii,
    config,
  }) => {
    if (!config.features.signatureHelperMustBeDisabled) {
      blockedBy(
        'Q-23',
        'Only applicable to non-development environments: set PII_SIGNATURE_HELPER_MUST_BE_DISABLED=true there.',
      );
      return;
    }
    const res = await pii.probeSignatureHelper();
    expect(
      res.status >= 200 && res.status < 300,
      `/docs/signature must not be usable here: ${res.summary()}`,
    ).toBe(false);
  });

  test('PII-SEC-004 A full flow across many endpoints leaves no personal data, keys or signatures in the logs', async ({
    pii,
    data,
    tenant,
    cleanup,
    config,
    log,
  }) => {
    const email = data.email();
    const phone = data.phone(0);
    const name = data.name();
    const userId = data.userId('sec4');
    await seedField(pii, cleanup, { tenant, userId, field: 'EMAIL', value: email });
    await seedField(pii, cleanup, { tenant, userId, field: 'NAME', value: name });
    await pii.readPii({ tenant_id: tenant, user_id: userId, field_names: ['EMAIL', 'NAME'] });
    await pii.searchPii('EMAIL', { tenant_id: tenant, value: email, include_values: true });
    const transient = await createTransient(pii, {
      tenant,
      phone: formattedPhone(phone.normalized),
      ttlSeconds: config.limits.transientTtlMinSeconds,
    });
    await pii.resolveTransientPhone({ tenant_id: tenant, transient_id: transient.transient_id });
    const key = await createKey(pii, cleanup, tenant);

    const lines = log.lines();
    expect(lines.length).toBeGreaterThanOrEqual(7);
    expectNoSecretsIn(lines, [email, phone.normalized, name, key.key], 'api-calls.log');
    // No line may contain an Ed25519 signature-shaped Base64 value (88 chars).
    expect(lines.filter((l) => /[A-Za-z0-9+/]{86}==/.test(l))).toEqual([]);
  });
});
