/** Report safety: sanitizer, collector allow-list, exporters, generator guards, catalog drift. */
import { expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mapStatus, parseApiCalls, runProfile } from '../../collector/pii-results-reporter';
import { areaForId, matchesRef, REQUIREMENTS } from '../../core/catalog';
import { testsToCsv } from '../../core/exporters';
import { maskRequestId, maskUrl, sanitizeText } from '../../core/sanitize';
import type { CollectedRun, HistoryEntry, ReportTest } from '../../core/types';
import { endpointInventory } from '../../generator/build-report-data';
import { loadHistory, saveHistoryEntry } from '../../generator/history';
import { parseCollectedRun } from '../../generator/schema';
import { assertNoSensitiveData } from '../../generator/write-report';
import { renderTraceabilityDoc, TRACEABILITY_DOC } from '../../generator/traceability-doc';
import { format } from 'prettier';
import { generate, PATHS } from '../../generator/generate';
import { INJECTED_SECRETS } from '../fixtures';

test.describe('REPORT safety', () => {
  test('RPT-SF-001 sanitizer removes emails, phones, PEM, tokens, JWTs, credentials and signatures', () => {
    const s = INJECTED_SECRETS;
    const out = sanitizeText(Object.values(s).join(' \n '));
    for (const v of Object.values(s)) expect(out, v.slice(0, 20)).not.toContain(v);
    expect(out).not.toContain('Hunter2Secret');
    expect(out).not.toContain('SuperSecret123');
    expect(sanitizeText('\u001b[31mred\u001b[0m')).toBe('red');
    // correlation data is preserved
    expect(sanitizeText('requestId=5e136a0b-2c1d-4f3e-9a8b-7c6d5e4f3a2b at 2026-09-26T10:00:00Z')).toContain(
      '5e136a0b-2c1d-4f3e-9a8b-7c6d5e4f3a2b',
    );
  });

  test('RPT-SF-002 masking helpers', () => {
    expect(maskUrl('https://pii-qa.internal.aisle.co:8443/x')).toBe('https://pii-•••e.co:8443');
    expect(maskUrl(undefined)).toBeNull();
    expect(maskRequestId('5e136a0b-2c1d-4f3e-9a8b-7c6d5e4f3a2b')).toBe('5e136a0b…3a2b');
  });

  test('RPT-SF-003 collector keeps only allow-listed API-call fields', () => {
    const log = [
      JSON.stringify({
        msg: 'HTTP call',
        endpoint: 'writePii',
        method: 'POST',
        path: '/api/v1/pii',
        status: 201,
        durationMs: 12,
        requestId: 'r1',
        value: 'jane@corp.com',
        body: '{"x":1}',
        signature: 'sig',
      }),
      JSON.stringify({
        msg: 'HTTP transport failure',
        endpoint: 'readPii',
        method: 'POST',
        path: '/api/v1/pii/read',
        transportError: 'ECONNREFUSED',
        durationMs: 3,
      }),
      'not json',
      JSON.stringify({ msg: 'Retrying after HTTP 503' }),
    ].join('\n');
    const calls = parseApiCalls(log);
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls)).not.toMatch(/jane|signature|"body"|"value"/);
    expect(calls[1]).toMatchObject({ status: null, transportError: 'ECONNREFUSED' });
  });

  test('RPT-SF-004 status model mapping', () => {
    expect(mapStatus('passed', [])).toBe('PASS');
    expect(mapStatus('timedOut', [])).toBe('FAIL');
    expect(mapStatus('skipped', [{ type: 'fixme' }, { type: 'blocked', description: 'Q-1' }])).toBe(
      'BLOCKED',
    );
    expect(mapStatus('skipped', [{ type: 'fixme' }])).toBe('FIXME');
    expect(mapStatus('skipped', [])).toBe('SKIPPED');
    expect(mapStatus(undefined, [])).toBe('UNKNOWN');
  });

  test('RPT-SF-005 CSV export neutralises formula injection and quotes fields', () => {
    const csv = testsToCsv([
      {
        id: '=HYPERLINK("x")',
        title: 'a,"b"',
        status: 'PASS',
        area: 'write',
        severity: 'high',
        endpoints: [],
        durationMs: 1,
        apiCalls: [],
        workerIndex: 0,
        retries: 0,
        tags: [],
        project: 'api',
        file: 'f',
        line: 1,
        startedAt: null,
        annotations: [],
      } as unknown as ReportTest,
    ]);
    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv).toContain('"a,""b"""');
  });

  test('RPT-SF-006 generator self-check refuses emails, private keys and signatures', () => {
    expect(() => assertNoSensitiveData('{"x":"jane@corp.com"}', 't')).toThrow(/self-check/);
    expect(() => assertNoSensitiveData(INJECTED_SECRETS.pem, 't')).toThrow();
    expect(() => assertNoSensitiveData(INJECTED_SECRETS.signature, 't')).toThrow();
    expect(() => assertNoSensitiveData('{"x":"[REDACTED_EMAIL]"}', 't')).not.toThrow();
  });

  test('RPT-SF-007 malformed run data is rejected with a clear message', () => {
    expect(() => parseCollectedRun({ schemaVersion: 1, tests: 'nope' }, 'x.json')).toThrow(/malformed/);
  });

  test('RPT-SF-008 DEMO data can never enter real history', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hist-'));
    expect(() => saveHistoryEntry(dir, { dataSource: 'DEMO' } as HistoryEntry)).toThrow(/non-REAL/);
    await expect(
      generate({
        input: PATHS.demoRun,
        out: path.join(dir, 'out'),
        historyDir: dir,
        quiet: true,
        bundle: false,
      }),
    ).rejects.toThrow(/Refusing to treat DEMO/);
    expect(loadHistory(dir, 10).entries).toEqual([]);
  });

  test('RPT-SF-009 catalog matches the real suite (no drift)', () => {
    const run = JSON.parse(readFileSync(PATHS.demoRun, 'utf8')) as CollectedRun; // inventory = real `playwright test --list`
    const ids = new Set(run.tests.map((t) => t.id));
    const unknownArea = [...ids].filter((id) => areaForId(id) === 'other');
    expect(unknownArea, 'tests without a recognised ID prefix').toEqual([]);
    const dangling = [...new Set(REQUIREMENTS.flatMap((r) => r.tests))].filter(
      (ref) => ![...ids].some((id) => matchesRef(id, ref)),
    );
    expect(dangling, 'requirement references to tests that do not exist').toEqual([]);
    const epKeys = new Set(endpointInventory().map((e) => e.key));
    const unknownEndpoints = REQUIREMENTS.flatMap((r) => r.endpoints).filter((e) => !epKeys.has(e));
    expect(unknownEndpoints).toEqual([]);
  });

  test('RPT-SF-010 docs/requirements-traceability.md is generated from the catalog and up to date', async () => {
    const options = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../.prettierrc'), 'utf8'),
    ) as Record<string, unknown>;
    const expected = await format(renderTraceabilityDoc(), { ...options, parser: 'markdown' });
    expect(readFileSync(TRACEABILITY_DOC, 'utf8'), 'stale doc — run: npm run docs:traceability').toBe(
      expected,
    );
  });

  test('RPT-SF-011 collector keeps the call phase and derives a run profile from the CLI', () => {
    const log = [
      JSON.stringify({
        msg: 'HTTP call',
        endpoint: 'writePii',
        method: 'POST',
        path: '/api/v1/pii',
        status: 201,
        durationMs: 3,
        phase: 'setup',
      }),
      JSON.stringify({
        msg: 'HTTP call',
        endpoint: 'readPii',
        method: 'POST',
        path: '/api/v1/pii/read',
        status: 403,
        durationMs: 3,
        phase: 'bogus',
      }),
      JSON.stringify({
        msg: 'HTTP transport failure',
        endpoint: 'healthReady',
        method: 'GET',
        path: '/health/ready',
        transportError: 'ECONNREFUSED',
        durationMs: 1,
        phase: 'preflight',
      }),
    ].join('\n');
    expect(parseApiCalls(log).map((c) => c.phase)).toEqual(['setup', undefined, 'preflight']);
    expect(runProfile(['playwright', 'test', '--project=api', '--grep', '@smoke'], ['api'])).toBe(
      'projects=api · grep=@smoke',
    );
    expect(runProfile(['playwright', 'test', 'tests/pii', '--project', 'api'], ['api'])).toBe(
      'projects=api · files=tests/pii',
    );
    expect(runProfile(['playwright', 'test'], ['unit', 'api'])).toBe('projects=api+unit');
  });
});
