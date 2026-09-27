/** The test-case catalog (plain-English descriptions) must match the real test suite exactly. */
import { expect, test } from '@playwright/test';
import { CROSS_ENDPOINT, primaryEndpoint } from '../../reporting/core/catalog';
import { resolveEndpoints } from '../../reporting/generator/build-report-data';
import { listInventory } from '../../reporting/generator/inventory';
import { TEST_CASES } from '../catalog';

test.describe('UNIT test-case catalog', () => {
  test('UT-DOC-002 Every service test has a clear description, and every description belongs to a real test', () => {
    const ids = new Set(listInventory(['api']).map((t) => t.id));
    const missing = [...ids].filter((id) => !TEST_CASES[id]).sort();
    const orphaned = Object.keys(TEST_CASES)
      .filter((id) => !ids.has(id))
      .sort();
    expect(missing, 'tests without a description — add them to tests/catalog/<area>.ts').toEqual([]);
    expect(orphaned, 'descriptions for tests that no longer exist — remove them').toEqual([]);
    // Every test must land under a real endpoint heading, unless its entry says it spans several on purpose.
    const unplaced = [...ids].filter(
      (id) =>
        primaryEndpoint(resolveEndpoints(id)) === CROSS_ENDPOINT &&
        TEST_CASES[id]?.endpoint !== 'crossEndpoint',
    );
    expect(
      unplaced,
      "tests whose endpoint can't be worked out from the ID — add endpoint: '<endpointKey>' (or 'crossEndpoint') to their catalog entry",
    ).toEqual([]);
    for (const [id, info] of Object.entries(TEST_CASES)) {
      expect(info.what.length, `${id}: "what" is empty`).toBeGreaterThan(20);
      expect(info.why.length, `${id}: "why" is empty`).toBeGreaterThan(20);
      expect(info.steps.length, `${id}: needs 2–5 steps`).toBeGreaterThanOrEqual(2);
      expect(info.expected.length, `${id}: "expected" is empty`).toBeGreaterThan(5);
    }
  });
});
