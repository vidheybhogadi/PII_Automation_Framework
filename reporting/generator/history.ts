/**
 * Run history — portable, file-based (no database):
 *
 *   reports/history/2026-09-26_140312__qa-auto-20260926t140300-ab12.json   (one compact HistoryEntry per run)
 *
 * CI keeps history across runs by restoring/saving this folder (see .github/workflows/m1-pii-api-tests.yml).
 * Only REAL runs are ever written. Demo history lives in reporting/fixtures and is never mixed in.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { HistoryEntry } from '../core/types';

export function historyFileName(entry: HistoryEntry): string {
  const stamp = entry.startedAt.replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const safeId = entry.runId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `${stamp}__${safeId}.json`;
}

/**
 * Runs recorded before the M1/M2 restructure (2026-10-19) keyed tests as `<project>::tests/…`; the specs now live
 * in m1/tests/. Re-key them so trends, comparisons and flaky detection still match.
 */
function migrateTestKeys(e: HistoryEntry): HistoryEntry {
  const tests: HistoryEntry['tests'] = {};
  for (const [key, value] of Object.entries(e.tests))
    tests[key.replace(/^([^:]+)::tests\//, '$1::m1/tests/')] = value;
  return { ...e, tests };
}

export function loadHistory(dir: string, limit: number): { entries: HistoryEntry[]; skipped: string[] } {
  if (!existsSync(dir)) return { entries: [], skipped: [] };
  const entries: HistoryEntry[] = [];
  const skipped: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      const e = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as HistoryEntry;
      if (typeof e.runId === 'string' && typeof e.startedAt === 'string' && e.counts && e.tests)
        entries.push(migrateTestKeys(e));
      else skipped.push(file);
    } catch {
      skipped.push(file);
    }
  }
  entries.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return { entries: entries.slice(-limit), skipped };
}

export function saveHistoryEntry(dir: string, entry: HistoryEntry): string {
  if (entry.dataSource !== 'REAL') throw new Error('Refusing to write non-REAL data into run history.');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, historyFileName(entry));
  writeFileSync(file, JSON.stringify(entry));
  return file;
}
