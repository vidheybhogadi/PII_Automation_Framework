/**
 * Every Milestone 2 case, ready to show: scenario cases + generated per-API cases, with the M1-style grouping and
 * one status rule (open questions only). Shared by the test-case workbook and the API guide so both always agree.
 */
import { buildBaseline, type Baseline } from './m2-baseline';
import { groupingOf, type Grouping } from './m2-grouping';
import { parseInventory, type InventoryApi } from './m2-inventory';
import { statusFromDeps } from './m2-questions';
import { CASES as SCENARIOS, type M2Case } from './m2-test-cases.data';

export type AnyCase = M2Case & { check?: string } & Grouping;

export interface M2Design {
  inventory: InventoryApi[];
  base: Baseline;
  scenarios: M2Case[];
  cases: AnyCase[];
}

export function buildDesign(root: string): M2Design {
  const inventory = parseInventory(root);
  const base = buildBaseline(inventory);
  const cases = [...SCENARIOS, ...base.cases].map((c) => {
    // A scenario explicitly judged runnable stays NOT RUN; everything else follows the open questions.
    const status = c.status === 'NOT RUN' ? 'NOT RUN' : statusFromDeps(c.deps);
    const automation =
      c.mode === 'Manual' ? 'NOT AUTOMATED' : status === 'BLOCKED' ? 'AUTOMATION BLOCKED' : 'NOT AUTOMATED';
    return { ...c, status, automation, ...groupingOf(c) } as AnyCase;
  });
  return { inventory, base, scenarios: SCENARIOS, cases };
}
