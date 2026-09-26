/**
 * Lightweight runtime validation of embedded report data (no zod in the bundle).
 * fatal  → the dashboard shows a diagnostic page instead of crashing.
 * warnings → a banner; everything that can still render does.
 */
import type { ReportData } from '../../core/types';

export interface Validation {
  fatal: string | null;
  warnings: string[];
}

export function validateReport(data: unknown): Validation {
  const warnings: string[] = [];
  if (!data || typeof data !== 'object') {
    return {
      fatal:
        'No report data was found. data/report-data.js is missing or failed to load — regenerate with `npm run report`.',
      warnings,
    };
  }
  const r = data as Partial<ReportData>;
  if (r.schemaVersion !== 1)
    return {
      fatal: `Unsupported report schema version: ${String(r.schemaVersion)}. Regenerate the report with this version of PII Sentinel.`,
      warnings,
    };
  if (!r.meta || !r.run || !Array.isArray(r.tests))
    return { fatal: 'Report data is incomplete: meta, run or tests are missing.', warnings };
  if (!Array.isArray(r.endpoints) || !r.config)
    return {
      fatal: 'Report data is incomplete: endpoint inventory or configuration is missing.',
      warnings,
    };

  const bad = r.tests.filter(
    (t) => !t || typeof t.key !== 'string' || typeof t.status !== 'string' || !Array.isArray(t.apiCalls),
  );
  if (bad.length) warnings.push(`${bad.length} test record(s) were malformed and have been ignored.`);
  if (!Array.isArray(r.history)) warnings.push('Run history is missing — trends are unavailable.');
  if (!r.environment) warnings.push('Environment information was not recorded.');
  for (const d of r.diagnostics ?? []) warnings.push(d);
  return { fatal: null, warnings };
}

/** Normalize tolerable gaps so sections can rely on the shape. */
export function normalizeReport(r: ReportData): ReportData {
  return {
    ...r,
    tests: r.tests.filter(
      (t) => t && typeof t.key === 'string' && typeof t.status === 'string' && Array.isArray(t.apiCalls),
    ),
    history: Array.isArray(r.history) ? r.history : [],
    diagnostics: r.diagnostics ?? [],
    environment: r.environment ?? {
      node: 'N/A',
      os: 'N/A',
      arch: 'N/A',
      playwright: 'N/A',
      framework: 'N/A',
      frameworkVersion: 'N/A',
      serviceUrl: null,
      runtime: 'N/A',
      timezone: 'N/A',
    },
  };
}
