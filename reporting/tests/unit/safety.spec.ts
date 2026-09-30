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
import { listInventory } from '../../generator/inventory';
import { demoRun, INJECTED_SECRETS } from '../fixtures';
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { buildTestCasesWorkbook } from '../../../scripts/generate-test-cases-xlsx';
import { enrichTests } from '../../generator/build-report-data';

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
    // Valid IDs = the demo dataset (legacy PII-* IDs) + the real suite (`playwright test --list`: AISLE-*, POC-*, UT-*).
    const run = JSON.parse(readFileSync(PATHS.demoRun, 'utf8')) as CollectedRun;
    const ids = new Set([...run.tests.map((t) => t.id), ...listInventory(['api', 'unit']).map((t) => t.id)]);
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

  test('RPT-SF-012 collector keeps the Aisle auth mode (token/none/custom) and never anything else', () => {
    const call = (auth: unknown) =>
      JSON.stringify({
        msg: 'HTTP call',
        endpoint: 'readPii',
        method: 'POST',
        path: '/api/v1/pii-test/read',
        status: 200,
        durationMs: 2,
        auth,
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXZhbHVl',
      });
    const calls = parseApiCalls([call('token'), call('none'), call('custom'), call('Bearer abc')].join('\n'));
    expect(calls.map((c) => c.auth)).toEqual(['token', 'none', 'custom', undefined]);
    expect(JSON.stringify(calls)).not.toMatch(/Bearer|eyJ|authorization/);
  });

  test('RPT-SF-013 CSV and Excel label a security finding "Security finding" (distinct from Fail)', async () => {
    const base = demoRun();
    const findingId = 'PII-SEC-001';
    const blockedId = 'PII-RD-002';
    const naId = 'PII-RD-003';
    const naAnswer = 'BQ-05: Dev confirmed this read variant is intentionally not supported';
    const run: CollectedRun = {
      ...base,
      tests: base.tests.map((t) =>
        t.id === findingId
          ? {
              ...t,
              status: 'FAIL',
              rawStatus: 'failed',
              annotations: [
                { type: 'security-finding', description: 'BQ-08: 422 errors echo the submitted value' },
              ],
              errors: [{ message: 'Error: expected the error body not to echo the value' }],
            }
          : t.id === blockedId
            ? {
                ...t,
                status: 'SKIPPED',
                rawStatus: 'skipped',
                annotations: [{ type: 'blocked', description: 'BQ-01: EMAIL access not granted' }],
              }
            : t.id === naId
              ? {
                  ...t,
                  status: 'SKIPPED',
                  rawStatus: 'skipped',
                  errors: [],
                  annotations: [{ type: 'not-applicable', description: naAnswer }],
                }
              : t,
      ),
    };
    const tests = enrichTests(run);

    // CSV: the status column is the reader-facing outcome.
    const csv = testsToCsv(tests.filter((t) => t.id === findingId || t.id === blockedId));
    const [header, ...rows] = csv.trim().split('\n');
    expect(header!.split(',').slice(0, 5)).toEqual(['test_id', 'endpoint', 'title', 'status', 'remarks']);
    const finding = rows.find((r) => r.startsWith(`${findingId},`))!;
    expect(finding).toContain(',Security finding,SECURITY FINDING (expected until Dev fixes it) — BQ-08');
    expect(rows.find((r) => r.startsWith(`${blockedId},`))).toContain(',Blocked,BLOCKED — BQ-01');

    // Excel: same labels, coloured differently from an automation failure.
    const dir = mkdtempSync(path.join(tmpdir(), 'xlsx-'));
    const runFile = path.join(dir, 'run-data.json');
    writeFileSync(runFile, JSON.stringify(run));
    const inventory = run.tests
      .filter((t) => t.project !== 'unit')
      .map(({ key, id, title, suite, file, line, project, tags }) => ({
        key,
        id,
        title,
        suite,
        file,
        line,
        project,
        tags,
      }));
    const { buffer, summary } = await buildTestCasesWorkbook({ runData: runFile, inventory });
    expect(summary).toMatch(/Security finding 1 · Blocked \d+ · Not Applicable 1/);
    const xlsx = path.join(dir, 'test-cases.xlsx');
    writeFileSync(xlsx, buffer);
    const read = async (file: string) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(file);
      return wb;
    };
    const wb = await read(xlsx);
    const ws = wb.getWorksheet('Test Cases')!;
    // Columns are found by header text (the same way the Tester Notes reader does).
    let headerRow: ExcelJS.Row | undefined;
    ws.eachRow((r) => {
      if (!headerRow && r.getCell(2).text === 'TC ID') headerRow = r;
    });
    const headers: string[] = [];
    headerRow!.eachCell((c, n) => (headers[n] = c.text));
    expect(headers.filter(Boolean)).toEqual([
      'S/No',
      'TC ID',
      'Test Name',
      'Module',
      'Endpoint',
      'Method',
      'Preconditions',
      'Request',
      'Steps',
      'Expected Result',
      'Validation',
      'Why It Matters',
      'Type',
      'Suite',
      'Priority',
      'Status',
      'Dependency / Blocker',
      'Actual Result / Remarks',
      'Tester Notes',
    ]);
    const colOf = (h: string) => headers.indexOf(h);
    const [STATUS, REMARKS, DEP, NOTES] = [
      'Status',
      'Actual Result / Remarks',
      'Dependency / Blocker',
      'Tester Notes',
    ].map(colOf) as [number, number, number, number];
    const cellsOf = (sheet: ExcelJS.Worksheet, id: string) => {
      let found: ExcelJS.Row | undefined;
      sheet.eachRow((r) => {
        if (r.getCell(2).text === id) found = r;
      });
      return found!;
    };
    const fRow = cellsOf(ws, findingId);
    expect(fRow.getCell(STATUS).text).toContain('Security finding');
    expect(fRow.getCell(REMARKS).text).toMatch(/^SECURITY FINDING \(expected until Dev fixes it\) — BQ-08/);
    expect(fRow.getCell(DEP).text).toContain('BQ-08: 422 errors echo the submitted value');
    expect(cellsOf(ws, blockedId).getCell(STATUS).text).toContain('Blocked');
    expect(cellsOf(ws, blockedId).getCell(DEP).text).toBe('BQ-01: EMAIL access not granted');
    // Not Applicable: its own label, colour and BQ answer.
    const naRow = cellsOf(ws, naId);
    expect(naRow.getCell(STATUS).text).toContain('Not Applicable');
    expect(naRow.getCell(REMARKS).text).toBe(`NOT APPLICABLE — ${naAnswer}`);
    expect(naRow.getCell(DEP).text).toBe(naAnswer);
    const argb = (c: ExcelJS.Cell) => (c.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    const skipRow = tests.find(
      (t) => t.status === 'SKIPPED' && !t.annotations.length && t.kind === 'integration',
    );
    if (skipRow) expect(argb(naRow.getCell(STATUS))).not.toBe(argb(cellsOf(ws, skipRow.id).getCell(STATUS)));
    expect(argb(naRow.getCell(STATUS))).not.toBe(argb(cellsOf(ws, blockedId).getCell(STATUS)));
    // Request is monospace; Module / Method are filled in.
    expect(fRow.getCell(colOf('Request')).font?.name).toBe('Menlo');
    expect(fRow.getCell(colOf('Module')).text).toBe('Response Security');
    expect(fRow.getCell(colOf('Method')).text).not.toBe('');
    const failRow = tests.find((t) => t.status === 'FAIL' && t.id !== findingId && t.kind === 'integration');
    if (failRow) expect(argb(fRow.getCell(STATUS))).not.toBe(argb(cellsOf(ws, failRow.id).getCell(STATUS)));
    let totals = '';
    ws.getRow(3).eachCell((c) => (totals += `${c.text} | `));
    expect(totals).toContain('Security finding: 1');
    expect(totals).toContain('Not Applicable: 1');
    expect(totals).toMatch(/Blocked: \d+/);

    // Tester Notes survive regeneration with the new column positions.
    naRow.getCell(NOTES).value = 'Confirmed with Dev on the call';
    await wb.xlsx.writeFile(xlsx);
    const again = await buildTestCasesWorkbook({ runData: runFile, inventory, notesFrom: xlsx });
    const xlsx2 = path.join(dir, 'test-cases-2.xlsx');
    writeFileSync(xlsx2, again.buffer);
    const ws2 = (await read(xlsx2)).getWorksheet('Test Cases')!;
    expect(cellsOf(ws2, naId).getCell(NOTES).text).toBe('Confirmed with Dev on the call');
  });
});
