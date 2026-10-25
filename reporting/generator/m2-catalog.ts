/**
 * Milestone 2 descriptions for the report: an M2 test's ID is its workbook row (m2/scripts → m2/docs/m2-test-cases.xlsx),
 * so its plain-English description comes straight from the M2 design. Node side only (reads the Dev inventory).
 */
import path from 'node:path';
import { buildDesign, type AnyCase } from '../../m2/scripts/m2-all-cases';
import { actionOf, GROUPS, groupOf, operationOf, type InventoryApi } from '../../m2/scripts/m2-inventory';
import { sanitizeText } from '../core/sanitize';
import type { ApiArea, TestDescription } from '../core/types';

const ROOT = path.resolve(__dirname, '../..');
let byId: Map<string, AnyCase> | undefined;
let inventory: Map<string, InventoryApi> | undefined;

function cases(): Map<string, AnyCase> {
  if (!byId) {
    const design = buildDesign(ROOT);
    byId = new Map(design.cases.map((c) => [c.id, c]));
    inventory = new Map(design.inventory.map((a) => [a.id, a]));
  }
  return byId;
}
function apis(): Map<string, InventoryApi> {
  cases();
  return inventory as Map<string, InventoryApi>;
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

/**
 * The API an M2 test mainly exercises and its area (G1–G10): the first API of its workbook case; for per-API tests
 * without a workbook row (e.g. M2-API-004-UNMIG), the API ID in its ID or title; the area falls back to its @gN tag.
 */
export function m2ApiOf(
  id: string,
  title: string,
  tags: readonly string[],
): { api?: string; apiArea?: string } {
  if (!isM2Id(id)) return {};
  const fromCase = cases().get(id)?.apis[0];
  const fromText = `${id} ${title}`.match(/\bAPI-\d{3}\b/)?.[0];
  const api = [fromCase, fromText].find((a): a is string => Boolean(a && apis().has(a)));
  const tagArea = tags
    .map((t) => t.replace(/^@/, '').toUpperCase())
    .find((t) => GROUPS.some((g) => g.key === t));
  const apiArea = (api ? groupOf(api)?.key : undefined) ?? tagArea;
  return { ...(api ? { api } : {}), ...(apiArea ? { apiArea } : {}) };
}

/** The M2 API areas (inventory order) with the endpoints that have tests — for the report's area/endpoint pickers. */
export function m2ApiAreas(tests: readonly { api?: string; apiArea?: string }[]): ApiArea[] {
  const used = new Set(tests.map((t) => t.api).filter(Boolean));
  const areas = new Set(tests.map((t) => t.apiArea).filter(Boolean));
  return GROUPS.filter((g) => areas.has(g.key)).map((g) => ({
    key: g.key,
    name: sanitizeText(g.name, 120),
    endpoints: g.ids
      .filter((i) => used.has(i))
      .map((i) => apis().get(i))
      .filter((a): a is InventoryApi => Boolean(a))
      .map((a) => ({
        key: a.id,
        method: sanitizeText(a.method, 10),
        path: sanitizeText(a.path, 200),
        name: sanitizeText(actionOf(a), 120),
        description: sanitizeText(operationOf(a), 120),
        authenticated: a.auth.length > 0,
      })),
  }));
}
