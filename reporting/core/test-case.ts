/**
 * Test-case inventory fields shared by the report (drawer, CSV), the Excel sheet and m1/docs/test-case-inventory.md:
 * Module, Endpoint, Method, Request and Validation. Browser-safe (no Node imports).
 *
 * Catalog entries may still lack `request` / `validation` while they are being written — every helper here
 * tolerates missing values and returns '' (the views show "—").
 */
import { ENDPOINTS } from '../../m1/src/clients/endpoints';
import { areaForId, areaInfo, CROSS_ENDPOINT, primaryEndpoint } from './catalog';

/** Shown wherever a value is missing. */
export const NONE = '—';

/** The module (area label) of a test ID, e.g. "PII Write", "Authentication". */
export function moduleOf(id: string): string {
  return areaInfo(areaForId(id)).label;
}

/** Method + path of a test's primary endpoint; cross-endpoint tests span "several endpoints". */
export function endpointOfTest(endpoints: readonly string[]): { key: string; method: string; path: string } {
  const key = primaryEndpoint(endpoints);
  const def = key === CROSS_ENDPOINT ? undefined : ENDPOINTS[key as keyof typeof ENDPOINTS];
  return def
    ? { key, method: def.method, path: def.path }
    : { key, method: key === CROSS_ENDPOINT ? 'several' : '', path: 'several endpoints' };
}

/** The five test types, in report order. */
export const TEST_TYPES = ['Positive', 'Negative', 'Security', 'Database', 'Contract'] as const;

/**
 * A test's type: its description's type, else its @positive / @negative / @security / @database / @contract tag
 * (Milestone 2 per-API tests without a workbook row carry the tag only), else ''.
 */
export function testTypeOf(t: { info?: { type?: string }; tags: readonly string[] }): string {
  return t.info?.type ?? TEST_TYPES.find((ty) => t.tags.includes(`@${ty.toLowerCase()}`)) ?? '';
}

/** A catalog `request` value, tolerant of entries that do not have one yet. */
export function requestOf(info: { request?: unknown } | undefined): string {
  return typeof info?.request === 'string' ? info.request.trim() : '';
}

/** A catalog `validation` list, tolerant of missing / malformed values. */
export function validationOf(info: { validation?: unknown } | undefined): string[] {
  const v = info?.validation;
  if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}
