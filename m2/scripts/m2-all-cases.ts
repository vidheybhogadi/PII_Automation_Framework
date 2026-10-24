/**
 * Every Milestone 2 case, ready to show: scenario cases + generated per-API cases, with the M1-style grouping and
 * one status rule (open questions only). Shared by the test-case workbook and the API guide so both always agree.
 */
import { buildBaseline, isWebRoute, needsProfile, type Baseline } from './m2-baseline';
import { ROUTE_STATE } from './m2-code-evidence';
import { groupingOf, type Grouping } from './m2-grouping';
import { parseInventory, type InventoryApi } from './m2-inventory';
import { OPEN, QUESTIONS, statusFromDeps } from './m2-questions';
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
  const byId = new Map(inventory.map((a) => [a.id, a]));
  const scenarios = SCENARIOS.map((c) => withDerivedDeps(c, byId));
  const cases = [...scenarios, ...base.cases].map((c) => {
    // A scenario explicitly judged runnable stays NOT RUN unless an open ACCESS question now gates it (e.g. M2Q-36:
    // the account state cannot be created); everything else follows the open questions.
    const accessOpen = c.deps.some(
      (d) => OPEN.has(d) && QUESTIONS.find((q) => q.id === d)?.kind === 'Access / environment',
    );
    const status = c.status === 'NOT RUN' && !accessOpen ? 'NOT RUN' : statusFromDeps(c.deps);
    const automation =
      c.mode === 'Manual' ? 'NOT AUTOMATED' : status === 'BLOCKED' ? 'AUTOMATION BLOCKED' : 'NOT AUTOMATED';
    return { ...c, status, automation, ...groupingOf(c) } as AnyCase;
  });
  return { inventory, base, scenarios, cases };
}

/**
 * Access dependencies a scenario inherits from its APIs (2026-10-23 design fix): a finished profile (M2Q-36) when
 * any of its APIs needs one, and the app user → PII user_id mapping (M2Q-37) for DB scenarios on app users.
 */
function withDerivedDeps(c: M2Case, byId: Map<string, InventoryApi>): M2Case {
  const deps = new Set(c.deps);
  if (c.apis.some((id) => byId.get(id) && needsProfile(byId.get(id)!))) deps.add('M2Q-36');
  if (c.apis.some((id) => byId.get(id) && isWebRoute(byId.get(id)!))) deps.add('M2Q-41');
  if (c.apis.some((id) => ROUTE_STATE[id])) deps.add('M2Q-32');
  const appUser = c.apis.some((id) => !/^API-(001|002|003|190|208)$/.test(id));
  if (c.id.startsWith('M2-DB-') && appUser) deps.add('M2Q-37');
  return deps.size === c.deps.length ? c : { ...c, deps: [...deps].sort() };
}
