/** Plain-English names for everything a reader sees. The report avoids jargon; technical terms stay in tooltips. */
import {
  CROSS_ENDPOINT,
  ENDPOINT_DESCRIPTIONS,
  ENDPOINT_GROUP_ORDER,
  primaryEndpoint,
} from '../../core/catalog';
import type { EndpointInfo, ReportTest } from '../../core/types';

export interface PlainEndpoint {
  key: string;
  /** Short friendly name, e.g. "Save PII". */
  name: string;
  /** What the endpoint does, in one line. */
  means: string;
  method: string;
  path: string;
  icon: string;
}

const NAMES: Record<string, [string, string]> = {
  healthReady: ['Health check', 'activity'],
  writePii: ['Save PII', 'zap'],
  readPii: ['Read PII', 'search'],
  searchPii: ['Search PII', 'search'],
  batchReadPii: ['Bulk read PII', 'layers'],
  createTransientPhone: ['Create temporary phone', 'clock'],
  resolveTransientPhone: ['Look up temporary phone', 'clock'],
  promoteTransientPhone: ['Promote temporary phone', 'clock'],
  createFreeTextKey: ['Create encryption key', 'key'],
  readFreeTextKey: ['Read encryption key', 'key'],
  revokeFreeTextKey: ['Revoke encryption key', 'key'],
  [CROSS_ENDPOINT]: ['Across endpoints', 'route'],
};

export function plainEndpoint(key: string, endpoints: readonly EndpointInfo[] = []): PlainEndpoint {
  const info = endpoints.find((e) => e.key === key);
  const [name, icon] = NAMES[key] ?? [info?.name ?? key, 'box'];
  if (key === CROSS_ENDPOINT)
    return {
      key,
      name,
      icon,
      method: '',
      path: 'several endpoints',
      means: 'Checks that span several or all endpoints',
    };
  return {
    key,
    name,
    icon,
    method: info?.method ?? 'POST',
    path: info?.path ?? '',
    means: info?.description ?? ENDPOINT_DESCRIPTIONS[key] ?? '',
  };
}

/** The endpoint heading a test is listed under (Milestone 2: its API, e.g. API-001). */
export const endpointOf = (t: ReportTest): string => t.api ?? primaryEndpoint(t.endpoints);

/**
 * Tests grouped by endpoint: known M1 endpoints in the guide's order, then any other endpoint (M2 API IDs in
 * numeric order, so new tests always show), then "Across endpoints".
 */
export function byEndpoint(tests: readonly ReportTest[]): { endpoint: string; tests: ReportTest[] }[] {
  const by = new Map<string, ReportTest[]>();
  for (const t of tests) {
    const k = endpointOf(t);
    const list = by.get(k);
    if (list) list.push(t);
    else by.set(k, [t]);
  }
  const known = (ENDPOINT_GROUP_ORDER as readonly string[]).filter((k) => k !== CROSS_ENDPOINT && by.has(k));
  const extra = [...by.keys()]
    .filter((k) => k !== CROSS_ENDPOINT && !known.includes(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const cross = by.has(CROSS_ENDPOINT) ? [CROSS_ENDPOINT] : [];
  return [...known, ...extra, ...cross].map((k) => ({ endpoint: k, tests: by.get(k) as ReportTest[] }));
}

/** "PII-WR-001 creating a new field returns 201 …" → "Creating a new field returns 201 …" */
export function plainTitle(title: string): string {
  const t = title.replace(/^\S+\s/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
