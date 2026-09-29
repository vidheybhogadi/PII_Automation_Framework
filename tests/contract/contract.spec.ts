/**
 * Response contract of the Aisle facade: the exact field names seen on staging (2026-09-29).
 * Only key NAMES are compared and reported — never values.
 */
import {
  expectExactKeys,
  expectStatus,
  expectSuccess,
  expectValidationError,
} from '../../src/assertions/response.assertions';
import { seedField } from '../../src/fixtures/steps';
import { expect, noteAssumption, test } from '../../src/fixtures/test-fixtures';
import { ENVELOPE_KEYS, healthReadyDataSchema } from '../../src/models/common.models';
import {
  BATCH_READ_DATA_KEYS,
  batchReadDataSchema,
  PII_FIELDS,
  PII_ITEM_KEYS,
  READ_PII_DATA_KEYS,
  readPiiDataSchema,
  WRITE_PII_DATA_KEYS,
  writePiiDataSchema,
} from '../../src/models/pii.models';

/** Tenant set by the facade itself (observed on staging). */
const AISLE_TENANT = 'aisle';

test.describe('Aisle facade — response contract', () => {
  test('AISLE-CON-001 Success replies contain exactly the agreed fields', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const health = await aisle.healthReady();
    expectSuccess(health, 200, healthReadyDataSchema);
    expectExactKeys(health.json(), ENVELOPE_KEYS, 'health envelope');
    expectExactKeys(health.data(), ['status'], 'health data');

    const userId = data.userId('con1');
    const write = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: data.name() });
    cleanup.leaveBehind('PII NAME', userId);
    const saved = expectSuccess(write, 201, writePiiDataSchema);
    expectExactKeys(write.json(), ENVELOPE_KEYS, 'save envelope');
    expectExactKeys(saved, WRITE_PII_DATA_KEYS, 'save data');
    expect(saved.tenant_id).toBe(AISLE_TENANT);

    const read = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] });
    const readData = expectSuccess(read, 200, readPiiDataSchema);
    expectExactKeys(read.json(), ENVELOPE_KEYS, 'read envelope');
    expectExactKeys(readData, READ_PII_DATA_KEYS, 'read data');
    readData.items.forEach((item, i) => expectExactKeys(item, PII_ITEM_KEYS, `read item #${i}`));
    expect(readData.tenant_id).toBe(AISLE_TENANT);

    const second = data.userId('con1b');
    await seedField(aisle, cleanup, { userId: second, field: PII_FIELDS.NAME, value: data.name() });
    const bulk = await aisle.batchRead({ user_ids: [userId, second], fields: [PII_FIELDS.NAME] });
    const bulkData = expectSuccess(bulk, 200, batchReadDataSchema);
    expectExactKeys(bulk.json(), ENVELOPE_KEYS, 'bulk-read envelope');
    expectExactKeys(bulkData, BATCH_READ_DATA_KEYS, 'bulk-read data');
    bulkData.items.forEach((item, i) => expectExactKeys(item, PII_ITEM_KEYS, `bulk-read item #${i}`));
    expect(bulkData.tenant_id).toBe(AISLE_TENANT);
  });

  test('AISLE-CON-002 Error replies keep their current format (401 empty, 400 “Invalid JSON”, 422 list of problems)', async ({
    aisle,
    data,
  }) => {
    noteAssumption(
      'BQ-09',
      'these are the formats observed today; the intended single error format is Dev’s call',
    );
    const userId = data.userId('con2');

    const noToken = await aisle.call(
      'readPii',
      { user_id: userId, field_names: [PII_FIELDS.NAME] },
      { tamper: { authorization: null } },
    );
    expectStatus(noToken, 401);
    expect(noToken.rawText().length, '401 body is empty').toBe(0);
    expect(noToken.header('content-type') ?? '', '401 content type').toContain('text/html');

    const broken = await aisle.call('writePii', undefined, {
      tamper: { bodyBytes: Buffer.from('{"user_id": ', 'utf8') },
    });
    expectStatus(broken, 400);
    expectExactKeys(broken.json(), ['error', 'message', 'status'], '400 body');
    expect(broken.json()).toEqual({
      status: false,
      error: 'Invalid JSON',
      message: 'Request body must be valid JSON',
    });

    const empty = await aisle.call('writePii', { user_id: userId, field: PII_FIELDS.NAME, value: '' });
    expectValidationError(empty, 'value');
    expectExactKeys(empty.json(), ['detail'], '422 body');
  });
});
