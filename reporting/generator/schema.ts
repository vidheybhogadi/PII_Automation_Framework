/** Runtime validation of collector output and report configuration (Node side). */
import { z } from 'zod';
import type { CollectedRun, ReportConfig } from '../core/types';

const status = z.enum(['PASS', 'FAIL', 'SKIPPED', 'BLOCKED', 'FIXME', 'UNKNOWN']);

const apiCall = z.object({
  endpoint: z.string(),
  method: z.string(),
  path: z.string(),
  status: z.number().int().nullable(),
  errorCode: z.string().optional(),
  durationMs: z.number().nonnegative(),
  requestId: z.string().optional(),
  caller: z.string().optional(),
  auth: z.enum(['token', 'none', 'custom']).optional(),
  transportError: z.string().optional(),
  phase: z.enum(['test', 'setup', 'verify', 'preflight']).optional(),
});

const test = z.object({
  key: z.string().min(1),
  id: z.string().min(1),
  title: z.string(),
  suite: z.string(),
  file: z.string(),
  line: z.number().int(),
  project: z.string(),
  tags: z.array(z.string()),
  status,
  rawStatus: z.string(),
  outcome: z.enum(['expected', 'unexpected', 'flaky', 'skipped']),
  durationMs: z.number().nonnegative(),
  startedAt: z.string().nullable(),
  workerIndex: z.number().int(),
  parallelIndex: z.number().int(),
  retries: z.number().int().nonnegative(),
  annotations: z.array(z.object({ type: z.string(), description: z.string().optional() })),
  errors: z.array(z.object({ message: z.string(), location: z.string().optional() })),
  steps: z.array(z.object({ title: z.string(), durationMs: z.number(), failed: z.boolean() })),
  apiCalls: z.array(apiCall),
  cleanup: z.object({ performed: z.number(), failed: z.number(), leftBehind: z.number() }).optional(),
});

export const collectedRunSchema = z.object({
  schemaVersion: z.literal(1),
  dataSource: z.enum(['REAL', 'DEMO']),
  run: z.object({
    runId: z.string(),
    label: z.string(),
    environment: z.string(),
    startedAt: z.string(),
    finishedAt: z.string(),
    durationMs: z.number().nonnegative(),
    playwrightStatus: z.string(),
    workers: z.number().int(),
    projects: z.array(z.string()),
    retries: z.number().int(),
    timeoutMs: z.number(),
    command: z.string(),
    profile: z.string().optional(),
    git: z.object({ commit: z.string().nullable(), branch: z.string().nullable() }),
    ci: z
      .object({
        provider: z.string(),
        runNumber: z.string().nullable(),
        runUrl: z.string().nullable(),
        build: z.string().nullable(),
      })
      .nullable(),
  }),
  environment: z.object({
    node: z.string(),
    os: z.string(),
    arch: z.string(),
    playwright: z.string(),
    framework: z.string(),
    frameworkVersion: z.string(),
    serviceUrl: z.string().nullable(),
    runtime: z.string(),
    timezone: z.string(),
  }),
  tests: z.array(test),
  diagnostics: z.array(z.string()),
});

const areaKey = z.string();

export const reportConfigSchema = z.object({
  gates: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      areas: z.array(areaKey),
      critical: z.boolean(),
      warnOnNotExecuted: z.boolean(),
    }),
  ),
  health: z.object({
    weights: z.object({
      passRate: z.number().min(0),
      criticalPassRate: z.number().min(0),
      completion: z.number().min(0),
      endpointCoverage: z.number().min(0),
    }),
    capOnCriticalFailure: z.number().min(0).max(100),
    bands: z.array(z.object({ label: z.string(), min: z.number() })).min(1),
  }),
  historyLimit: z.number().int().min(1).max(500),
});

function issues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

export function parseCollectedRun(json: unknown, source: string): CollectedRun {
  const parsed = collectedRunSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Run data "${source}" is malformed:\n${issues(parsed.error)}`);
  return parsed.data as CollectedRun;
}

export function parseReportConfig(json: unknown): ReportConfig {
  const parsed = reportConfigSchema.safeParse(json);
  if (!parsed.success)
    throw new Error(`reporting/config/report-config.json is invalid:\n${issues(parsed.error)}`);
  return parsed.data as ReportConfig;
}
