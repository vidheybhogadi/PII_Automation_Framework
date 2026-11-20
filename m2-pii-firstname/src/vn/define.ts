/**
 * One Playwright test per vernac design case (titled with its workbook ID and name), blocked exactly as the design
 * says (blockIfOpen), plus the vernac write gate: a case that changes a team account runs only with
 * M2FN_VN_RUN=true. Helpers to pick team users from the discovery and to build the divergent member D.
 */
import { automatable, caseById, titleOf, type M2fnDesignCase } from '../../scripts/m2fn-design';
import { VN_WRITE_CASES } from '../../scripts/m2fn-vernac-cases.data';
import { blockPrereq } from '../../../m2/src/prereq';
import { blockIfOpen } from '../define';
import { VN } from './client';
import { test, VN_BLOCK, type VnCtx } from './fixtures';
import type { VnApp } from './guard';
import { usable, userById, writable, type TeamUser } from './team';

function gate(c: M2fnDesignCase, vn: VnCtx): void {
  blockIfOpen(c);
  if (VN_WRITE_CASES.has(c.id) && !vn.cfg.run)
    blockPrereq(
      VN_BLOCK.run,
      'This case changes a team account; it runs only with M2FN_VN_RUN=true (QA lead 2026-11-11)',
    );
}

export function vnScenario(id: string, run: (vn: VnCtx, c: M2fnDesignCase) => Promise<void>): void {
  const c = caseById(id);
  if (!automatable(c)) return;
  test(titleOf(c), { tag: c.tags }, async ({ vn }) => {
    gate(c, vn);
    await run(vn, c);
  });
}

/** A parametrised case: one test per item, titled "<ID> <name> — <label>". */
export function vnParamScenario(
  id: string,
  label: string,
  run: (vn: VnCtx, c: M2fnDesignCase) => Promise<void>,
): void {
  const c = caseById(id);
  if (!automatable(c)) return;
  test(`${titleOf(c)} — ${label}`, { tag: c.tags }, async ({ vn }) => {
    gate(c, vn);
    await run(vn, c);
  });
}

// ---- Picking team users ---------------------------------------------------------------------------------------------
const APP_ORDER: VnApp[] = ['Arike', 'Neene', 'Neetho', 'Anbe'];

/** The main app: the first in-scope app with two writable team users (D and A). */
export function mainPair(
  vn: VnCtx,
  need: { dVerified?: boolean } = {},
): { d: TeamUser; a: TeamUser; app: VnApp } {
  for (const app of APP_ORDER.filter((x) => vn.cfg.apps.includes(x))) {
    const w = vn.team.users.filter((u) => u.app === app && writable(u) && u.state === 'approved');
    const ds = need.dVerified ? w.filter((u) => u.selfieVerified) : w;
    // Prefer the highest team number as D (…9 before …3) so runs are stable.
    const d = [...ds].sort((x, y) => y.number.localeCompare(x.number))[0];
    const a = d && vn.team.users.find((u) => u.app === app && u !== d && usable(u) && u.state === 'approved');
    if (d && a) return { d, a, app };
  }
  return blockPrereq(
    VN_BLOCK.state,
    `No in-scope app has an approved team user with a PII name${need.dVerified ? ' and a verified selfie' : ''} plus a second approved team user`,
  );
}

export const byId = (vn: VnCtx, id: string) => userById(vn.team, id);

// ---- Names ------------------------------------------------------------------------------------------------------------
let counter = 0;
const letters = (n: number) => {
  let s = '';
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  } while (n > 0);
  return s;
};

/** A run-unique fake name, letters only: "Qa" + letters from the run id and a counter. */
export function vnName(vn: VnCtx, first = 'Qa'): string {
  counter += 1;
  const tail = vn.runId
    .replace(/[^a-z0-9]/gi, '')
    .slice(-6)
    .replace(/\d/g, (d) => String.fromCharCode(97 + Number(d)));
  return `${first}${tail}${letters(Date.now() % 100_000)}${letters(counter)}`.replace(/[^A-Za-z]/g, '');
}

/** A run-unique fake Malayalam-script name (letters from the Malayalam block U+0D15 … U+0D39). */
export function vnMalayalamName(vn: VnCtx): string {
  const base = vnName(vn, 'x')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return [...`ab${base}`]
    .map((ch) => String.fromCodePoint(0x0d15 + ((ch.charCodeAt(0) - 97) % 0x25)))
    .join('');
}

export interface Divergent {
  /** The double-space form kept by Postgres. */
  db: string;
  /** The single-space form the PII service stores and every getter view shows. */
  pii: string;
}

/**
 * Make D divergent: CMS rename to "Qa<run>␣␣Zy<run>" (QA lead 2026-11-11). Blocks when the rename does not produce
 * the divergence (then nothing in the case would tell PII from Postgres).
 */
export async function makeDivergent(vn: VnCtx, d: TeamUser): Promise<Divergent> {
  const left = vnName(vn, 'Qa');
  const right = vnName(vn, 'Zy');
  const div = { db: `${left}  ${right}`, pii: `${left} ${right}` };
  const res = await vn.rename(d, div.db);
  if (res.status !== 200) throw new Error(`CMS rename of D: HTTP ${res.status}`);
  const db = await vn.dbName(d, div.db);
  const cms = await vn.cmsName(d);
  if (!db.isValue || cms !== div.pii)
    blockPrereq(
      VN_BLOCK.state,
      `The CMS rename did not make D divergent (Postgres keeps the double space: ${db.isValue}; CMS view is the single-space form: ${cms === div.pii})`,
    );
  return div;
}

// ---- Reading names from replies -----------------------------------------------------------------------------------------
type Obj = Record<string, unknown>;
const refKeys = ['ref', 'ref_id', 'from_ref', 'to_ref', 'user_ref', 'profile_ref'];

/** The object (any depth) that names `ref` in one of the ref keys (or general_information.ref). */
export function vnEntry(body: unknown, ref: string): Obj | undefined {
  if (!body || typeof body !== 'object') return undefined;
  if (Array.isArray(body)) {
    for (const x of body) {
      const f = vnEntry(x, ref);
      if (f) return f;
    }
    return undefined;
  }
  const o = body as Obj;
  const gi = o.general_information as Obj | undefined;
  if (refKeys.some((k) => String(o[k] ?? '') === ref) || String(gi?.ref ?? gi?.ref_id ?? '') === ref)
    return o;
  for (const v of Object.values(o)) {
    const f = vnEntry(v, ref);
    if (f) return f;
  }
  return undefined;
}

/** The name the entry gives for `ref` (from_name / to_name for activity rows, else first_name / name). */
export function vnNameOf(body: unknown, ref: string): unknown {
  const e = vnEntry(body, ref);
  if (!e) return undefined;
  if (String(e.from_ref ?? '') === ref && 'from_name' in e) return e.from_name;
  if (String(e.to_ref ?? '') === ref && 'to_name' in e) return e.to_name;
  const gi = e.general_information as Obj | undefined;
  return e.first_name ?? gi?.first_name ?? e.name;
}

/** Every string value of a `first_name` key anywhere in a body. */
export function firstNames(body: unknown, out: string[] = []): string[] {
  if (!body || typeof body !== 'object') return out;
  if (Array.isArray(body)) {
    for (const x of body) firstNames(x, out);
    return out;
  }
  for (const [k, v] of Object.entries(body as Obj)) {
    if (k === 'first_name' && typeof v === 'string') out.push(v);
    else firstNames(v, out);
  }
  return out;
}

export const initial = (name: string) => name.charAt(0).toUpperCase();
export { VN };
