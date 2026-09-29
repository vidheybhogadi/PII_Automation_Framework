/**
 * Security checks on what the Aisle facade exposes: tenant injection, echo of personal data in errors,
 * leaks into our own logs/reports, and user isolation. Assertion messages never contain the values.
 */
import { expectStatus, expectSuccess, expectValidationError } from '../../src/assertions/response.assertions';
import { expectNoSecretsIn, expectSecretEquals } from '../../src/assertions/security.assertions';
import { requireToken } from '../../src/config/config';
import { expectNotPersisted, seedField } from '../../src/fixtures/steps';
import { blockedBy, expect, noteAssumption, securityFinding, test } from '../../src/fixtures/test-fixtures';
import { PII_FIELDS, readPiiDataSchema, writePiiDataSchema } from '../../src/models/pii.models';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';
/** A clearly made-up tenant, used only to check that the caller cannot choose the tenant. */
const FAKE_TENANT = 'qa-auto-fake-tenant';

test.describe('Aisle facade — response and data security', { tag: ['@security'] }, () => {
  test('AISLE-SEC-001 A tenant ID sent by the caller is ignored or refused: data can never land in another tenant', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption('BQ-06', 'observed: the made-up tenant is ignored; ignoring vs refusing is Dev’s call');
    const userId = data.userId('sec1');
    const name = data.name();

    const write = await aisle.call('writePii', {
      user_id: userId,
      field: PII_FIELDS.NAME,
      value: name,
      tenant_id: FAKE_TENANT,
    });
    if (write.status === 400 || write.status === 422) {
      // Refused is also safe: nothing may have been saved.
      await expectNotPersisted(aisle, { userId, field: PII_FIELDS.NAME });
      return;
    }
    cleanup.leaveBehind('PII NAME', userId);
    const saved = expectSuccess(write, [201, 200], writePiiDataSchema);
    expect(saved.tenant_id, 'save reply tenant').toBe(AISLE_TENANT);

    const injectedRead = await aisle.call('readPii', {
      user_id: userId,
      field_names: [PII_FIELDS.NAME],
      tenant_id: FAKE_TENANT,
    });
    if (injectedRead.status !== 400 && injectedRead.status !== 422) {
      const read = expectSuccess(injectedRead, 200, readPiiDataSchema);
      expect(read.tenant_id, 'read reply tenant (tenant sent by caller)').toBe(AISLE_TENANT);
      expect(read.items.every((i) => i.tenant_id === AISLE_TENANT)).toBe(true);
    }

    const normalRead = expectSuccess(
      await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] }),
      200,
      readPiiDataSchema,
    );
    expect(normalRead.tenant_id, 'normal read tenant').toBe(AISLE_TENANT);
    expect(normalRead.items[0]?.tenant_id).toBe(AISLE_TENANT);
    expectSecretEquals(normalRead.items[0]?.value, name, 'NAME saved under the aisle tenant');
  });

  test('AISLE-SEC-002 Error replies do not repeat the personal value that was sent, or internal details', async ({
    aisle,
    data,
  }) => {
    securityFinding(
      'BQ-08',
      '422 replies echo the submitted value and the internal tenant_id in detail[].input',
    );
    const name = data.name();

    // Leaving out user_id makes the save fail validation while the fake name is in the request. (For a MISSING
    // field FastAPI echoes the whole body; a wrong-TYPE field only echoes that field — seen on staging.)
    const res = await aisle.call('writePii', { field: PII_FIELDS.NAME, value: name });
    expectValidationError(res, 'user_id');
    const text = res.rawText();
    expect(text.includes(name), '422 reply repeats the submitted fake name').toBe(false);
    expect(text.includes('tenant_id'), '422 reply exposes the internal tenant_id field').toBe(false);
  });

  test(
    'AISLE-SEC-003 Test logs and report files contain no token and no personal data',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle, data, cleanup, log, config }) => {
      const token = requireToken(config).reveal();
      const userId = data.userId('sec3');
      const name = data.name();

      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });
      expectStatus(await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] }), 200);
      expectStatus(
        await aisle.call(
          'writePii',
          { user_id: userId, field: PII_FIELDS.NAME, value: name },
          { tamper: { authorization: null } },
        ),
        401,
      );

      const lines = log.lines();
      expect(lines.length, 'the calls were logged').toBeGreaterThan(0);
      expect(
        lines.some((l) => l.includes('requestId')),
        'request IDs are still visible',
      ).toBe(true);
      expectNoSecretsIn(lines, [token, name], 'api-calls.log');

      const info = test.info();
      const attachments = info.attachments
        .filter((a) => a.body !== undefined)
        .map((a) => a.body!.toString('utf8'));
      expectNoSecretsIn(
        [JSON.stringify(info.annotations), ...attachments],
        [token, name],
        'report annotations and attachments',
      );
    },
  );

  test('AISLE-SEC-004 The test token cannot read another user’s data', async () => {
    blockedBy('BQ-07', 'Whether one token may read any user ID is Dev’s decision (today it can)');
  });
});
