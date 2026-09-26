/** Plain-English names for everything a reader sees. The report avoids jargon; technical terms stay in tooltips. */
import { CROSS_ENDPOINT, ENDPOINT_DESCRIPTIONS, primaryEndpoint } from '../../core/catalog';
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
  const [name, icon] = NAMES[key] ?? [key, 'box'];
  const info = endpoints.find((e) => e.key === key);
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

/** The endpoint heading a test is listed under. */
export const endpointOf = (t: ReportTest): string => primaryEndpoint(t.endpoints);

/** "PII-WR-001 creating a new field returns 201 …" → "Creating a new field returns 201 …" */
export function plainTitle(title: string): string {
  const t = title.replace(/^\S+\s/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
