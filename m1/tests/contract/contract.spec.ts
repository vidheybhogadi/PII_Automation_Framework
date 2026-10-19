/**
 * Response contract of the PII service: the exact field names in each reply's data part, and the 422 format.
 * The envelope around the data and the tenant value are set by the facade and are not checked here.
 * Only key NAMES are compared and reported — never values.
 */
import {
  expectExactKeys,
  expectSuccess,
  expectValidationError,
} from '../../src/assertions/response.assertions';
import { BLOCKERS, createKey, seedField } from '../../src/fixtures/steps';
import { blockIfAccessDenied, noteObserved, test, expect } from '../../src/fixtures/test-fixtures';
import {
  FREE_TEXT_KEY_DATA_KEYS,
  freeTextKeyDataSchema,
  REVOKE_FREE_TEXT_KEY_DATA_KEYS,
  revokeFreeTextKeyDataSchema,
} from '../../src/models/free-text.models';
import {
  BATCH_READ_DATA_KEYS,
  batchReadDataSchema,
  PII_FIELDS,
  PII_ITEM_KEYS,
  READ_PII_DATA_KEYS,
  readPiiDataSchema,
  SEARCH_DATA_KEYS,
  searchIdsOnlyDataSchema,
  searchWithValuesDataSchema,
  WRITE_PII_DATA_KEYS,
  writePiiDataSchema,
} from '../../src/models/pii.models';

test.describe('Aisle facade — response contract', () => {
  test('AISLE-CON-001 The data part of NAME save, read and bulk-read replies contains exactly the agreed fields', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('con1');
    const write = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: data.name() });
    cleanup.leaveBehind('PII NAME', userId);
    const saved = expectSuccess(write, 201, writePiiDataSchema);
    expectExactKeys(saved, WRITE_PII_DATA_KEYS, 'save data');

    const read = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] });
    const readData = expectSuccess(read, 200, readPiiDataSchema);
    expectExactKeys(readData, READ_PII_DATA_KEYS, 'read data');
    readData.items.forEach((item, i) => expectExactKeys(item, PII_ITEM_KEYS, `read item #${i}`));

    const second = data.userId('con1b');
    await seedField(aisle, cleanup, { userId: second, field: PII_FIELDS.NAME, value: data.name() });
    const bulk = await aisle.batchRead({ user_ids: [userId, second], fields: [PII_FIELDS.NAME] });
    const bulkData = expectSuccess(bulk, 200, batchReadDataSchema);
    expectExactKeys(bulkData, BATCH_READ_DATA_KEYS, 'bulk-read data');
    bulkData.items.forEach((item, i) => expectExactKeys(item, PII_ITEM_KEYS, `bulk-read item #${i}`));
  });

  test('AISLE-CON-002 A validation error (422) is a list of problems, each naming the field, the message and the error type', async ({
    aisle,
    data,
  }) => {
    noteObserved(
      '2026-10-01',
      '422 body is exactly {detail: [{loc, msg, type, …}]} (the PII service’s format)',
    );
    const res = await aisle.call('writePii', {
      user_id: data.userId('con2'),
      field: PII_FIELDS.NAME,
      value: '',
    });
    expectValidationError(res, 'value');
    expectExactKeys(res.json(), ['detail'], '422 body');
    const detail = (res.json() as { detail: Record<string, unknown>[] }).detail;
    expect(detail.length, 'at least one problem listed').toBeGreaterThan(0);
    for (const [i, problem] of detail.entries()) {
      for (const key of ['loc', 'msg', 'type'])
        expect(key in problem, `problem #${i} has "${key}"`).toBe(true);
    }
  });

  test('AISLE-CON-003 The data part of EMAIL, search and free-text-key replies contains exactly the agreed fields', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved(
      '2026-10-01',
      'data fields of EMAIL save/read/bulk read, search (with and without values) and free-text keys',
    );
    const users = [data.userId('con3a'), data.userId('con3b')];
    const email = data.email('con3');
    const save = await aisle.writePii({ user_id: users[0]!, field: PII_FIELDS.EMAIL, value: email });
    blockIfAccessDenied(save, BLOCKERS.email.id, BLOCKERS.email.reason);
    cleanup.leaveBehind('PII EMAIL', users[0]!);
    expectExactKeys(expectSuccess(save, 201, writePiiDataSchema), WRITE_PII_DATA_KEYS, 'EMAIL save data');
    await seedField(aisle, cleanup, { userId: users[1]!, field: PII_FIELDS.EMAIL, value: email });

    const read = expectSuccess(
      await aisle.readPii({ user_id: users[0]!, field_names: [PII_FIELDS.EMAIL] }),
      200,
      readPiiDataSchema,
    );
    expectExactKeys(read, READ_PII_DATA_KEYS, 'EMAIL read data');
    read.items.forEach((item, i) => expectExactKeys(item, PII_ITEM_KEYS, `EMAIL read item #${i}`));

    const bulk = expectSuccess(
      await aisle.batchRead({ user_ids: users, fields: [PII_FIELDS.EMAIL] }),
      200,
      batchReadDataSchema,
    );
    expectExactKeys(bulk, BATCH_READ_DATA_KEYS, 'EMAIL bulk-read data');
    bulk.items.forEach((item, i) => expectExactKeys(item, PII_ITEM_KEYS, `EMAIL bulk-read item #${i}`));

    const withValues = expectSuccess(
      await aisle.searchPii(PII_FIELDS.EMAIL, { value: email, limit: 10, include_values: true }),
      200,
      searchWithValuesDataSchema,
    );
    expectExactKeys(withValues, SEARCH_DATA_KEYS, 'search data (values on)');
    withValues.matches.forEach((m, i) => expectExactKeys(m, PII_ITEM_KEYS, `search match #${i} (values on)`));
    const idsOnly = expectSuccess(
      await aisle.searchPii(PII_FIELDS.EMAIL, { value: email, limit: 10, include_values: false }),
      200,
      searchIdsOnlyDataSchema,
    );
    expectExactKeys(idsOnly, SEARCH_DATA_KEYS, 'search data (values off)');
    idsOnly.matches.forEach((m, i) => expectExactKeys(m, ['user_id'], `search match #${i} (values off)`));

    const created = await createKey(aisle, cleanup);
    expectExactKeys(created, FREE_TEXT_KEY_DATA_KEYS, 'free-text create data');
    const readKey = expectSuccess(
      await aisle.readFreeTextKey({ key_id: created.key_id }),
      200,
      freeTextKeyDataSchema,
    );
    expectExactKeys(readKey, FREE_TEXT_KEY_DATA_KEYS, 'free-text read data');
    const revoked = expectSuccess(
      await aisle.revokeFreeTextKey({ key_id: created.key_id }),
      200,
      revokeFreeTextKeyDataSchema,
    );
    expectExactKeys(revoked, REVOKE_FREE_TEXT_KEY_DATA_KEYS, 'free-text revoke data');
  });
});
