/**
 * Milestone 2 descriptions for the report: an M2 test's ID is its workbook row (m2/scripts → m2/docs/m2-test-cases.xlsx),
 * so its plain-English description comes straight from the M2 design. Node side only (reads the Dev inventory).
 */
import path from 'node:path';
import { buildDesign, type AnyCase } from '../../m2/scripts/m2-all-cases';
import type { TestDescription } from '../core/types';

const ROOT = path.resolve(__dirname, '../..');
let byId: Map<string, AnyCase> | undefined;

function cases(): Map<string, AnyCase> {
  byId ??= new Map(buildDesign(ROOT).cases.map((c) => [c.id, c]));
  return byId;
}

export const isM2Id = (id: string) => id.startsWith('M2-');

export function m2TestInfo(id: string): TestDescription | undefined {
  if (!isM2Id(id)) return undefined;
  const c = cases().get(id);
  if (!c) return undefined;
  return {
    what: `${c.name}. Test data: ${c.data}`,
    why: c.why,
    steps: c.steps,
    expected: `${c.expected} (Evidence: ${c.evidence})`,
    type: c.type,
    priority: c.priority,
    ...(c.pre ? { preconditions: c.pre } : {}),
    validation: [c.validate],
    category: c.category,
  };
}
