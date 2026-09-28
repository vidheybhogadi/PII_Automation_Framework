/**
 * PII Sentinel collector — a Playwright reporter that writes normalized, sanitized run data after every run.
 *
 *   reporter: [['./reporting/collector/pii-results-reporter.ts', { outputFile: 'reports/latest/run-data.json' }]]
 *
 * PII safety: only ALLOW-LISTED fields are copied. From the redacted `api-calls.log` attachment we keep
 * endpoint/method/path/status/errorCode/duration/requestId/caller only. Request/response bodies, headers,
 * signatures and keys are never read. All free text passes through sanitizeText().
 */
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { maskUrl, sanitizeText } from '../core/sanitize';
import {
  SCHEMA_VERSION,
  type ApiCallRecord,
  type Annotation,
  type CallPhase,
  type CollectedRun,
  type CollectedTest,
  type TestStatus,
} from '../core/types';
import { isPending } from '../../src/config/placeholders';

interface Options {
  outputFile?: string;
}

const ID_PATTERN = /^[A-Z]+(?:-[A-Za-z0-9]+)+$/;

export function displayIdFromTitle(title: string): string {
  const first = title.split(/\s+/)[0] ?? '';
  return ID_PATTERN.test(first) ? first : `T-${hash(title).slice(0, 6).toUpperCase()}`;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function mapStatus(rawStatus: string | undefined, annotations: readonly Annotation[]): TestStatus {
  switch (rawStatus) {
    case 'passed':
      return 'PASS';
    case 'failed':
    case 'timedOut':
      return 'FAIL';
    case 'skipped':
      if (annotations.some((a) => a.type === 'blocked')) return 'BLOCKED';
      if (annotations.some((a) => a.type === 'fixme')) return 'FIXME';
      return 'SKIPPED';
    default:
      return 'UNKNOWN';
  }
}

const PHASES: readonly CallPhase[] = ['test', 'setup', 'verify', 'preflight'];
function phaseOf(entry: Record<string, unknown>): { phase?: CallPhase } {
  return PHASES.includes(entry.phase as CallPhase) ? { phase: entry.phase as CallPhase } : {};
}

/**
 * Run profile — which projects and filters produced the run, so trends compare like with like.
 * Derived from the CLI (projects, --grep/-g, --grep-invert, positional file filters).
 */
export function runProfile(argv: readonly string[], projects: readonly string[]): string {
  const grab = (names: string[]) => {
    const out: string[] = [];
    argv.forEach((a, i) => {
      for (const n of names) {
        if (a === n && argv[i + 1]) out.push(argv[i + 1] as string);
        else if (a.startsWith(`${n}=`)) out.push(a.slice(n.length + 1));
      }
    });
    return out;
  };
  const cmd = argv.indexOf('test');
  const files =
    cmd >= 0
      ? argv
          .slice(cmd + 1)
          .filter(
            (a, i, all) =>
              !a.startsWith('-') &&
              !(all[i - 1] ?? '').match(
                /^(-g|--grep|--grep-invert|--project|--reporter|--workers|-j|--config|-c|--retries|--timeout|--max-failures)$/,
              ),
          )
      : [];
  const parts = [`projects=${[...projects].sort().join('+') || 'all'}`];
  const grep = grab(['--grep', '-g']);
  const invert = grab(['--grep-invert']);
  if (grep.length) parts.push(`grep=${grep.join('|')}`);
  if (invert.length) parts.push(`grep-invert=${invert.join('|')}`);
  if (files.length) parts.push(`files=${files.sort().join('+')}`);
  return sanitizeText(parts.join(' · '), 200);
}

/** Parse the framework's redacted per-test log: keep only allow-listed fields of "HTTP call" entries. */
export function parseApiCalls(logText: string): ApiCallRecord[] {
  const calls: ApiCallRecord[] = [];
  for (const line of logText.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const str = (k: string) =>
      typeof entry[k] === 'string' ? sanitizeText(entry[k] as string, 200) : undefined;
    const num = (k: string) => (typeof entry[k] === 'number' ? (entry[k] as number) : undefined);
    if (entry.msg === 'HTTP call') {
      calls.push({
        endpoint: str('endpoint') ?? 'unknown',
        method: str('method') ?? '?',
        path: str('path') ?? '?',
        status: num('status') ?? null,
        ...(str('errorCode') ? { errorCode: str('errorCode') } : {}),
        durationMs: num('durationMs') ?? 0,
        ...(str('requestId') ? { requestId: str('requestId') } : {}),
        ...(str('caller') ? { caller: str('caller') } : {}),
        ...phaseOf(entry),
      });
    } else if (entry.msg === 'HTTP transport failure') {
      calls.push({
        endpoint: str('endpoint') ?? 'unknown',
        method: str('method') ?? '?',
        path: str('path') ?? '?',
        status: null,
        durationMs: num('durationMs') ?? 0,
        ...(str('requestId') ? { requestId: str('requestId') } : {}),
        transportError: str('transportError') ?? 'UNKNOWN',
        ...phaseOf(entry),
      });
    }
  }
  return calls;
}

function flattenSteps(steps: readonly TestStep[], prefix = '', depth = 0): CollectedTest['steps'] {
  const out: CollectedTest['steps'] = [];
  for (const s of steps) {
    if (s.category !== 'test.step') continue;
    const title = `${prefix}${sanitizeText(s.title, 160)}`;
    out.push({ title, durationMs: s.duration, failed: Boolean(s.error) });
    if (depth < 1) out.push(...flattenSteps(s.steps, `${title} › `, depth + 1));
  }
  return out.slice(0, 40);
}

function git(cmd: string): string | null {
  try {
    return (
      execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim() || null
    );
  } catch {
    return null;
  }
}

function readVersion(pkgPath: string): string {
  try {
    return (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export default class PiiResultsReporter implements Reporter {
  private readonly outputFile: string;
  private config!: FullConfig;
  private rootSuite!: Suite;
  private readonly startedAt = new Date();
  private readonly results = new Map<string, { test: TestCase; result: TestResult }>();

  constructor(options: Options = {}) {
    this.outputFile = path.resolve(options.outputFile ?? 'reports/latest/run-data.json');
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.rootSuite = suite;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Called once per attempt; the last attempt wins (its `retry` index is the retry count).
    this.results.set(test.id, { test, result });
  }

  onEnd(result: FullResult): void {
    // `playwright test --list` only lists tests; nothing ran, so the last real results must not be overwritten.
    if (process.argv.includes('--list')) return;
    const rootDir = this.config.rootDir;
    const tests: CollectedTest[] = this.rootSuite.allTests().map((test) => this.collect(test, rootDir));
    const finishedAt = new Date();
    const pkgDir = process.cwd();
    const ci = process.env.GITHUB_ACTIONS
      ? {
          provider: 'GitHub Actions',
          runNumber: process.env.GITHUB_RUN_NUMBER ?? null,
          runUrl:
            process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
              ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
              : null,
          build: process.env.BUILD_NUMBER ?? process.env.GITHUB_RUN_NUMBER ?? null,
        }
      : process.env.CI
        ? {
            provider: 'CI',
            runNumber: process.env.BUILD_NUMBER ?? null,
            runUrl: null,
            build: process.env.BUILD_NUMBER ?? null,
          }
        : null;

    const argv = process.argv.slice(1).map((a) => (path.basename(a) === 'cli.js' ? 'playwright' : a));
    const cmdStart = Math.max(
      0,
      argv.findIndex((a) => /playwright/.test(a)),
    );
    const projects = [...new Set(tests.map((t) => t.project))];
    const runId = process.env.PII_TEST_RUN_ID ?? `run-${this.startedAt.getTime()}`;

    const run: CollectedRun = {
      schemaVersion: SCHEMA_VERSION,
      dataSource: 'REAL',
      run: {
        runId,
        label: ci?.runNumber
          ? `Run #${ci.runNumber}`
          : `Local run ${this.startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
        environment:
          // A PENDING_ placeholder means "not set" — never show it as the environment name.
          (process.env.PII_ENVIRONMENT && !isPending(process.env.PII_ENVIRONMENT)
            ? process.env.PII_ENVIRONMENT
            : undefined) ?? (projects.every((p) => p === 'unit') ? 'local (no service)' : 'local'),
        startedAt: this.startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: result.duration ?? finishedAt.getTime() - this.startedAt.getTime(),
        playwrightStatus: result.status,
        workers: this.config.workers,
        projects,
        retries: Math.max(0, ...this.config.projects.map((p) => p.retries)),
        timeoutMs: Math.max(0, ...this.config.projects.map((p) => p.timeout)),
        command: sanitizeText(argv.slice(cmdStart).join(' '), 300),
        profile: runProfile(argv.slice(cmdStart), projects),
        git: {
          commit: process.env.GITHUB_SHA ?? git('rev-parse HEAD'),
          branch: process.env.GITHUB_REF_NAME ?? git('rev-parse --abbrev-ref HEAD'),
        },
        ci,
      },
      environment: {
        node: process.version,
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
        playwright: this.config.version,
        framework: 'aisle-pii-api-automation',
        frameworkVersion: readVersion(path.join(pkgDir, 'package.json')),
        serviceUrl:
          process.env.REPORT_SHOW_SERVICE_URL === 'true'
            ? (process.env.PII_BASE_URL ?? null)
            : maskUrl(process.env.PII_BASE_URL),
        runtime: 'Node.js — API tests via Axios (no browser)',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      tests,
      diagnostics: [],
    };

    mkdirSync(path.dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, JSON.stringify(run, null, 2));
  }

  private collect(test: TestCase, rootDir: string): CollectedTest {
    const entry = this.results.get(test.id);
    const result = entry?.result;
    const annotations: Annotation[] = [];
    const seen = new Set<string>();
    for (const a of [
      ...test.annotations,
      ...((result as { annotations?: Annotation[] } | undefined)?.annotations ?? []),
    ]) {
      const clean = {
        type: a.type,
        ...(a.description ? { description: sanitizeText(a.description, 400) } : {}),
      };
      const k = `${clean.type}|${clean.description ?? ''}`;
      if (!seen.has(k)) {
        seen.add(k);
        annotations.push(clean);
      }
    }
    const status = mapStatus(result?.status, annotations);

    let apiCalls: ApiCallRecord[] = [];
    let cleanup: CollectedTest['cleanup'];
    for (const att of result?.attachments ?? []) {
      const body = att.body ?? (att.path ? safeRead(att.path) : undefined);
      if (!body) continue;
      if (att.name === 'api-calls.log') apiCalls = parseApiCalls(body.toString('utf8'));
      if (att.name === 'cleanup-summary.json') {
        try {
          const s = JSON.parse(body.toString('utf8')) as {
            performed?: unknown[];
            failed?: unknown[];
            leftBehind?: unknown[];
          };
          cleanup = {
            performed: s.performed?.length ?? 0,
            failed: s.failed?.length ?? 0,
            leftBehind: s.leftBehind?.length ?? 0,
          };
        } catch {
          /* ignore malformed attachment */
        }
      }
    }

    const titlePath = test.titlePath().filter(Boolean);
    const file = path.relative(rootDir, test.location.file) || test.location.file;
    const project = test.parent.project()?.name ?? 'default';
    return {
      key: `${project}::${file}::${titlePath.slice(2).join(' › ') || test.title}`,
      id: displayIdFromTitle(test.title),
      title: sanitizeText(test.title, 300),
      suite: sanitizeText(titlePath.slice(2, -1).join(' › '), 300),
      file: file.split(path.sep).join('/'),
      line: test.location.line,
      project,
      tags: test.tags,
      status,
      rawStatus: result?.status ?? 'notRun',
      outcome: result ? test.outcome() : 'skipped',
      durationMs: result?.duration ?? 0,
      startedAt: result?.startTime ? result.startTime.toISOString() : null,
      workerIndex: result?.workerIndex ?? -1,
      parallelIndex: result?.parallelIndex ?? -1,
      retries: result?.retry ?? 0,
      annotations,
      errors: (result?.errors ?? []).slice(0, 5).map((e) => ({
        message: sanitizeText(e.message ?? e.value ?? 'Unknown error', 3000),
        ...(e.location
          ? {
              location: `${path.relative(rootDir, e.location.file).split(path.sep).join('/')}:${e.location.line}`,
            }
          : {}),
      })),
      steps: flattenSteps(result?.steps ?? []),
      apiCalls,
      ...(cleanup ? { cleanup } : {}),
    };
  }
}

function safeRead(p: string): Buffer | undefined {
  try {
    return readFileSync(p);
  } catch {
    return undefined;
  }
}
