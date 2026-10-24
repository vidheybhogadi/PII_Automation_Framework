/**
 * Brings Milestone 2 automation results into the workbook (npm run m2:docs):
 *   - Automation Status: AUTOMATED for every case that has a test in the m2-api project
 *     (AUTOMATION BLOCKED when the design still blocks it; NOT APPLICABLE / WAITING tests skip by design → AUTOMATED);
 *   - Current Status: PASS / FAIL / BLOCKED from the last M2 run (reports/m2/latest/run-data.json), if there is one;
 *   - Last Run (observed): run date, result and the value-free reply shapes the tests recorded ("observed").
 * Without a run file the design status stays as it is. Results are never invented.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { listInventory } from '../../reporting/generator/inventory';
import type { CollectedRun } from '../../reporting/core/types';
import type { AnyCase } from './m2-all-cases';
import type { Status } from './m2-test-cases.data';

export const M2_RUN_DATA = 'reports/m2/latest/run-data.json';

export interface WithResults {
  cases: AnyCase[];
  lastRun: Map<string, string>;
  automated: number;
  ran: number;
  runDate: string | null;
}

function automatedIds(): Set<string> {
  try {
    return new Set(listInventory(['m2-api']).map((t) => t.id));
  } catch {
    return new Set(); // listing needs the Playwright CLI
  }
}

export function applyResults(root: string, cases: AnyCase[]): WithResults {
  const automated = automatedIds();
  const file = path.join(root, M2_RUN_DATA);
  const run =
    existsSync(file) && (JSON.parse(readFileSync(file, 'utf8')) as CollectedRun).dataSource === 'REAL'
      ? (JSON.parse(readFileSync(file, 'utf8')) as CollectedRun)
      : undefined;
  const runDate = run?.run.startedAt?.slice(0, 10) ?? null;
  const byId = new Map((run?.tests ?? []).filter((t) => t.project === 'm2-api').map((t) => [t.id, t]));
  const lastRun = new Map<string, string>();
  let ran = 0;
  const out = cases.map((c) => {
    if (!automated.has(c.id)) return c;
    // NOT APPLICABLE / WAITING cases have their test (it skips with the reason by design), so they count as AUTOMATED.
    const automation = ['NOT RUN', 'NOT APPLICABLE', 'WAITING'].includes(c.status)
      ? 'AUTOMATED'
      : 'AUTOMATION BLOCKED';
    const t = byId.get(c.id);
    let status: Status = c.status;
    // A design NOT APPLICABLE / WAITING status is not overwritten by an older run that still showed it Blocked.
    if (c.status === 'NOT APPLICABLE' || c.status === 'WAITING') {
      if (t && t.status !== 'SKIPPED' && t.status !== 'UNKNOWN') ran++;
      return { ...c, status, automation } as AnyCase;
    }
    if (t?.status === 'PASS') status = 'PASS';
    else if (t?.status === 'FAIL') status = 'FAIL';
    else if (t?.status === 'BLOCKED' || t?.status === 'FIXME') status = 'BLOCKED';
    if (t && t.status !== 'SKIPPED' && t.status !== 'UNKNOWN') {
      ran++;
      const observed = t.annotations
        .filter((a) => a.type === 'observed' && a.description)
        .map((a) => a.description)
        .join('; ');
      const blocked = t.annotations.find((a) => a.type === 'blocked')?.description;
      lastRun.set(
        c.id,
        `${runDate} ${t.status}${observed ? ` — ${observed}` : blocked ? ` — ${blocked}` : ''}`,
      );
    }
    return { ...c, status, automation } as AnyCase;
  });
  return { cases: out, lastRun, automated: automated.size, ran, runDate };
}
