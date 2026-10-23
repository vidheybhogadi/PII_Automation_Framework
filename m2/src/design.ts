/**
 * The Milestone 2 test design (m2/scripts) as seen by the tests. Specs are GENERATED from it — the per-API checks,
 * the case names, tags and open questions are never copied into test code — so a test title always equals its
 * workbook row (m2/docs/m2-test-cases.xlsx) and a case is Blocked exactly when its design says so.
 */
import path from 'node:path';
import { buildDesign, type AnyCase, type M2Design } from '../scripts/m2-all-cases';
import type { InventoryApi } from '../scripts/m2-inventory';
import { OPEN, QUESTIONS } from '../scripts/m2-questions';

export const ROOT = path.resolve(__dirname, '../..');

let cached: M2Design | undefined;
export function design(): M2Design {
  cached ??= buildDesign(ROOT);
  return cached;
}

export function caseById(id: string): AnyCase {
  const c = design().cases.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown M2 case ${id} — it is not in m2/scripts (run npm run m2:docs to check)`);
  return c;
}

export function apiById(id: string): InventoryApi {
  const a = design().inventory.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown inventory API ${id}`);
  return a;
}

/** All generated per-API cases of one check (e.g. 'AUTH'), in API order. */
export function casesFor(check: string): AnyCase[] {
  return design()
    .cases.filter((c) => c.check === check)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The test title: workbook ID + workbook name, so results map back to the workbook row. */
export const titleOf = (c: AnyCase) => `${c.id} ${c.name}`;

/** Open questions a case still waits for (empty = runnable). */
export function openDeps(c: AnyCase): { id: string; topic: string }[] {
  return c.deps
    .filter((d) => OPEN.has(d))
    .map((d) => ({ id: d, topic: QUESTIONS.find((q) => q.id === d)?.topic ?? '' }));
}
