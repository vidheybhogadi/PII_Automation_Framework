/**
 * Milestone 2 grouping — the same divisions the M1 report uses, so M2 cases filter and sort the same way:
 *   - Type: M1's five values (reporting/dashboard/src/store.tsx TYPE_ORDER) — Positive, Negative, Security,
 *     Database, Contract. The report's "Group by Type" works for M2 without a report change.
 *   - Category: the finer division inside a type (Validation, Unmigrated data, Access control, …).
 *   - Suite: Smoke or Regression, exactly like M1 (@smoke tag = Smoke, everything else = Regression).
 *   - Planned tags: the Playwright tags each case will carry when automated (@m2 @g3 @positive @smoke @db …).
 */
import { groupOf, type PiiField } from './m2-inventory';

export type CaseType = 'Positive' | 'Negative' | 'Security' | 'Database' | 'Contract';
export const TYPE_ORDER: CaseType[] = ['Positive', 'Negative', 'Security', 'Database', 'Contract'];

export type Category =
  | 'Functional'
  | 'Integration & consistency'
  | 'Regression'
  | 'Validation'
  | 'Negative & edge case'
  | 'Unmigrated data'
  | 'State & idempotency'
  | 'Resilience'
  | 'Authentication'
  | 'Access control'
  | 'PII exposure'
  | 'Hidden name'
  | 'DB persistence'
  | 'Response contract';

export const CATEGORY_TYPE: Record<Category, CaseType> = {
  Functional: 'Positive',
  'Integration & consistency': 'Positive',
  Regression: 'Positive',
  Validation: 'Negative',
  'Negative & edge case': 'Negative',
  'Unmigrated data': 'Negative',
  'State & idempotency': 'Negative',
  Resilience: 'Negative',
  Authentication: 'Security',
  'Access control': 'Security',
  'PII exposure': 'Security',
  'Hidden name': 'Security',
  'DB persistence': 'Database',
  'Response contract': 'Contract',
};
export const CATEGORY_ORDER = Object.keys(CATEGORY_TYPE) as Category[];

export type Suite = 'Smoke' | 'Regression';

/** Scenario cases in the smoke suite: the shortest path that proves each PII write/read path works. */
const SMOKE_SCENARIOS = new Set([
  'M2-PIIR-001',
  'M2-PIIR-003',
  'M2-FNAME-001',
  'M2-FNAME-004',
  'M2-FNAME-009',
  'M2-EMAIL-001',
  'M2-PHONE-001',
  'M2-XFLD-001',
  'M2-CMS-002',
  'M2-INT-001',
]);
/** Per-API checks in the smoke suite, for the groups that write or return PII directly. */
const SMOKE_CHECKS = new Set(['POS', 'AUTH']);
const SMOKE_GROUPS = new Set(['G1', 'G2', 'G3']);

export interface Grouping {
  type: CaseType;
  category: Category;
  suite: Suite;
  tags: string[];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function groupingOf(c: {
  id: string;
  category: Category;
  apis: string[];
  fields: PiiField[];
  check?: string;
}): Grouping {
  const type = CATEGORY_TYPE[c.category];
  const group = groupOf(c.apis[0]!).key;
  const suite: Suite =
    SMOKE_SCENARIOS.has(c.id) || (c.check && SMOKE_CHECKS.has(c.check) && SMOKE_GROUPS.has(group))
      ? 'Smoke'
      : 'Regression';
  const tags = [
    '@m2',
    `@${group.toLowerCase()}`,
    `@${type.toLowerCase()}`,
    `@${slug(c.category)}`,
    suite === 'Smoke' ? '@smoke' : '@regression',
    ...c.fields.map((f) => `@${f.toLowerCase()}`),
  ];
  if (type === 'Security' && !tags.includes('@security')) tags.push('@security');
  if (type === 'Database') tags.push('@db');
  return { type, category: c.category, suite, tags: [...new Set(tags)] };
}
