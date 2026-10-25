/**
 * Contract baselines (M2Q-24, answered 2026-10-23): approved staging recordings are the contract reference.
 *
 *   1. RECORD — only on explicit request: `npm run m2:contracts:record` (M2_CONTRACTS_RECORD=true). Each case writes
 *      m2/contracts/recorded/<case>.json: per request variant the status, content type, the recursive key/type
 *      SHAPE of the body and which PII keys it carries (names only — never values, tokens or ids). The test is then
 *      marked "recorded" (skipped), never passed.
 *   2. REVIEW — m2/contracts/REVIEW.md (npm run m2:contracts:review) lists new / changed recordings vs approved.
 *   3. APPROVE — `npm run m2:contracts:approve -- --by "<name>" <case…|all>` copies a reviewed recording to
 *      m2/contracts/approved/ with {approved: {by, on}}.
 *   4. ASSERT — normal runs compare only against approved files; no approved file → Blocked (M2Q-24). A 2xx to an
 *      INVALID-input variant fails unless the approved file carries `acceptedBecause` for that label (audit fix
 *      2026-10-25 — an approved 2xx is no longer proof that accepting the input is right).
 * Caveat (M2Q-24 answer): staging already runs the PII branch, so baselines catch future changes, not differences
 * from master.
 */
import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ApiResponse } from '../../../core/http/api-response';
import { PII_KEYS } from '../assertions/pii.assertions';
import { ROOT } from '../design';
import { blockPrereq, PREREQ } from '../prereq';

export type Shape = string | Shape[] | { [k: string]: Shape };

export interface Observation {
  status: number;
  contentType: string;
  shape: Shape;
  piiKeys: string[];
}

export interface BaselineFile {
  caseId: string;
  recordedAt: string;
  runId: string;
  build: string;
  note: string;
  variants: Record<string, Observation>;
  /** Variants that broke the case's own invariants while recording (e.g. a 5xx) — highlighted in the review. */
  invariantFailures?: string[];
  /** Variants deliberately NOT sent (safety rule, e.g. M2Q-46): label → Blocked reason. Never approved. */
  notSent?: Record<string, string>;
  approved?: { by: string; on: string };
  /**
   * Set on an approved file known to be stale (the reason): the next approval REPLACES its variants with the new
   * recording instead of merging, and drops this mark. Normal runs still assert against it (and say so).
   */
  reRecord?: string;
  /** Every approval that changed the file (approve merges new recordings into the approved shape). */
  approvals?: { by: string; on: string; recordedAt: string; runId: string }[];
  /**
   * Audit fix 2026-10-25: invalid-input variants (PARAM / BODY, and STATE except "valid request") whose 2xx reply is
   * ACCEPTED, label → the code reference that makes the input optional / defaulted (e.g. standardize_params). Without
   * an entry, a 2xx for invalid input is a failure ("invalid input accepted") even when the approved file has 2xx.
   */
  acceptedBecause?: Record<string, string>;
}

/** Checks whose variants all send INVALID input (STATE: every variant but the valid request). */
const INVALID_CHECKS = ['PARAM', 'BODY'];
export const VALID_STATE_VARIANT = 'valid request';

/** Whether a baseline variant sends invalid input (by the case's check, from its id M2-API-nnn-<CHECK>). */
export function isInvalidVariant(caseId: string, label: string): boolean {
  const check = caseId.match(/^M2-API-\d+-(.+)$/)?.[1];
  if (!check) return false;
  if (INVALID_CHECKS.includes(check)) return true;
  return check === 'STATE' && label !== VALID_STATE_VARIANT;
}

/**
 * Why a reply to an invalid-input variant is NOT acceptable, or undefined: a 2xx is accepted only when the approved
 * baseline names the code reference for that label in `acceptedBecause` (never inferred, never bulk-added).
 */
export function invalidAcceptedProblem(
  caseId: string,
  label: string,
  status: number,
  approved: Pick<BaselineFile, 'acceptedBecause'> | undefined,
): string | undefined {
  if (!isInvalidVariant(caseId, label) || status < 200 || status >= 300) return undefined;
  if (approved?.acceptedBecause?.[label]) return undefined;
  return `invalid input accepted (HTTP ${status}) — a 2xx for this variant is allowed only with an acceptedBecause code reference in the approved baseline (npm run m2:contracts:approve -- --by "<name>" --accept "${label}=<code ref>" ${caseId})`;
}

export const CONTRACTS_DIR = path.join(ROOT, 'm2/contracts');
export const recordedFile = (caseId: string) => path.join(CONTRACTS_DIR, 'recorded', `${caseId}.json`);
export const approvedFile = (caseId: string) => path.join(CONTRACTS_DIR, 'approved', `${caseId}.json`);

/**
 * A key that names a RECORD, not a field: all digits (an app user id) or an 8-character upper-case hex profile ref.
 * An object whose keys are all such ids is an id-keyed map (e.g. first_names: {<user id>: name}, profiles: {<ref>:
 * {…}}): which ids come back depends on the request, so the map is compared by the shape of its VALUES, under the
 * single key ID_MAP_KEY (2026-10-24, M2-API-003-CONTRACT / M2-API-190-CONTRACT fix).
 */
export const ID_LIKE_KEY = /^(\d+|[0-9A-F]{8})$/;
export const ID_MAP_KEY = '<id>';

const isIdMap = (o: object) => {
  const keys = Object.keys(o);
  return keys.length > 0 && keys.every((k) => ID_LIKE_KEY.test(k));
};

/** Recursive key/type shape. Arrays: merged shape of their elements; null stays "null"; id-keyed maps → {<id>: …}. */
export function shapeOf(v: unknown): Shape {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) {
    if (!v.length) return [];
    const merged = v.map(shapeOf).reduce((a, b) => mergeShapes(a, b));
    return [merged];
  }
  if (typeof v === 'object') {
    if (isIdMap(v as object))
      return {
        [ID_MAP_KEY]: Object.values(v as Record<string, unknown>)
          .map(shapeOf)
          .reduce((a, b) => mergeShapes(a, b)),
      };
    const out: Record<string, Shape> = {};
    for (const k of Object.keys(v as object).sort()) out[k] = shapeOf((v as Record<string, unknown>)[k]);
    return out;
  }
  return typeof v;
}

/**
 * The same shape with every id-keyed map folded to {<id>: <union of its value shapes>} — applied to approved files
 * recorded before shapeOf folded maps, so old and new recordings compare alike. Idempotent.
 */
export function normalizeShape(s: Shape): Shape {
  if (Array.isArray(s)) return s.map(normalizeShape);
  if (s && typeof s === 'object') {
    if (isIdMap(s))
      return {
        [ID_MAP_KEY]: Object.values(s)
          .map(normalizeShape)
          .reduce((a, b) => unionRaw(a, b)),
      };
    const out: Record<string, Shape> = {};
    for (const k of Object.keys(s).sort()) out[k] = normalizeShape(s[k]!);
    return out;
  }
  return s;
}

function mergeShapes(a: Shape, b: Shape): Shape {
  if (a === 'null') return b;
  if (b === 'null') return a;
  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out: Record<string, Shape> = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in out ? mergeShapes(out[k]!, v) : v;
    return out;
  }
  return a;
}

/** PII-bearing key names in a body (names only). */
export function piiKeyNames(v: unknown, out = new Set<string>()): string[] {
  if (Array.isArray(v)) v.forEach((x) => piiKeyNames(x, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (PII_KEYS.includes(k.toLowerCase())) out.add(k);
      piiKeyNames(x, out);
    }
  return [...out].sort();
}

export function observe(res: ApiResponse): Observation {
  return {
    status: res.status,
    contentType: (res.header('content-type') ?? '').split(';')[0]!.trim(),
    shape: res.isJson ? shapeOf(res.json()) : res.rawText().trim() ? 'text' : 'empty',
    piiKeys: res.isJson ? piiKeyNames(res.json()) : [],
  };
}

const kindOf = (s: Shape) =>
  s === 'null' ? 'null' : Array.isArray(s) ? 'array' : typeof s === 'object' ? 'object' : 'scalar';

/**
 * Differences between an approved shape and a live one, as value-free paths ("$.profile.first_name: missing").
 * - "null" matches any type (nullable fields); empty arrays are not compared element-wise.
 * - Outside lists every key counts (missing / new keys and type changes fail).
 * - Inside list items the data decides which records come back (other members' optional fields, nullable
 *   sub-objects, stale cache keys), so (2026-10-24): only keys present in both are compared, scalar top-level keys of
 *   an item keep their type check, and nested objects / lists inside an item are compared by kind only (object vs
 *   list vs value), not by their keys. New PII keys anywhere are still caught by the separate PII-key comparison.
 * `itemDepth`: -1 outside lists, 0 = a list item, 1 = a value of an item's top-level key.
 */
export function shapeDiff(expected: Shape, actual: Shape): string[] {
  return diffShapes(normalizeShape(expected), normalizeShape(actual));
}

function diffShapes(expected: Shape, actual: Shape, at = '$', itemDepth = -1): string[] {
  if (expected === 'null' || actual === 'null') return [];
  const ek = kindOf(expected);
  const ak = kindOf(actual);
  if (itemDepth >= 1 && (ek !== 'scalar' || ak !== 'scalar')) return ek === ak ? [] : [`${at}: type changed`];
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return [`${at}: type changed`];
    if (!expected.length || !actual.length) return [];
    return diffShapes(expected[0]!, actual[0]!, `${at}[]`, 0);
  }
  if (typeof expected === 'object' || typeof actual === 'object') {
    if (typeof expected !== 'object' || typeof actual !== 'object') return [`${at}: type changed`];
    const inList = itemDepth >= 0;
    const next = inList ? itemDepth + 1 : -1;
    const out: string[] = [];
    for (const k of Object.keys(expected)) {
      if (!(k in actual)) {
        if (!inList) out.push(`${at}.${k}: missing`);
      } else out.push(...diffShapes(expected[k]!, actual[k]!, `${at}.${k}`, next));
    }
    if (!inList) for (const k of Object.keys(actual)) if (!(k in expected)) out.push(`${at}.${k}: new key`);
    return out;
  }
  return expected === actual ? [] : [`${at}: ${expected} → ${actual}`];
}

/** PII key names that a shape carries OUTSIDE lists (the caller's own objects), names only. */
export function piiKeysOutsideLists(shape: Shape, out = new Set<string>()): string[] {
  if (shape && typeof shape === 'object' && !Array.isArray(shape))
    for (const [k, v] of Object.entries(shape)) {
      if (PII_KEYS.includes(k.toLowerCase())) out.add(k);
      piiKeysOutsideLists(v, out);
    }
  return [...out].sort();
}

/**
 * PII-key comparison (2026-10-24): a NEW PII key anywhere fails; a missing PII key fails only when the approved
 * shape carries it outside lists — a key that lived only inside list items depends on the records returned (note).
 */
export function piiKeyDiff(
  want: Pick<Observation, 'piiKeys' | 'shape'>,
  seen: Pick<Observation, 'piiKeys'>,
): { failures: string[]; notes: string[] } {
  const top = piiKeysOutsideLists(want.shape);
  const failures = seen.piiKeys.filter((k) => !want.piiKeys.includes(k)).map((k) => `NEW PII key ${k}`);
  const notes: string[] = [];
  for (const k of want.piiKeys.filter((x) => !seen.piiKeys.includes(x)))
    if (top.includes(k)) failures.push(`missing PII key ${k}`);
    else notes.push(`PII key ${k} (only inside list items) not in this reply — data-dependent`);
  return { failures, notes };
}

/**
 * Union of two shapes (approving a new recording on top of an approved one); conflicting types → the newer one.
 * Id-keyed maps are folded first (normalizeShape), so the union never accumulates record ids.
 */
export function unionShapes(a: Shape, b: Shape): Shape {
  return unionRaw(normalizeShape(a), normalizeShape(b));
}

function unionRaw(a: Shape, b: Shape): Shape {
  if (a === 'null') return b;
  if (b === 'null') return a;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (!a.length) return b;
    if (!b.length) return a;
    return [unionRaw(a[0]!, b[0]!)];
  }
  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out: Record<string, Shape> = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in out ? unionRaw(out[k]!, v) : v;
    return Object.fromEntries(
      Object.keys(out)
        .sort()
        .map((k) => [k, out[k]!]),
    );
  }
  return b;
}

/**
 * The recorded variants that may be approved. Never approved: a variant that broke an invariant while recording, a
 * recorded server error (status ≥ 500 — also in recordings made before REPEAT / STATE had that invariant), and a
 * variant that must never be sent (`notSent`, or `unsafe(label)` for older recordings; safety rule M2Q-46).
 */
export function approvableVariants(
  rec: BaselineFile,
  unsafe: (label: string) => string | undefined = () => undefined,
): { approve: Record<string, Observation>; refused: { label: string; why: string }[] } {
  const approve: Record<string, Observation> = {};
  const refused: { label: string; why: string }[] = [];
  const broken = new Set(rec.invariantFailures ?? []);
  for (const [label, obs] of Object.entries(rec.variants)) {
    const never = rec.notSent?.[label] ?? unsafe(label);
    if (broken.has(label) || obs.status >= 500)
      refused.push({ label, why: 'broke an invariant while recording — not approved (stays a finding)' });
    else if (never) refused.push({ label, why: `is never sent (${never}) — not approved` });
    else approve[label] = obs;
  }
  return { approve, refused };
}

/** Block early (before any account or request) when a normal run has no approved baseline for the case. */
export function requireBaseline(caseId: string, ctx: { record: boolean }): void {
  if (ctx.record) return;
  const ok =
    existsSync(approvedFile(caseId)) &&
    Boolean((JSON.parse(readFileSync(approvedFile(caseId), 'utf8')) as BaselineFile).approved);
  if (!ok) blockPrereq(PREREQ.baseline.id, PREREQ.baseline.reason);
}

export interface Variant {
  label: string;
  send: () => Promise<ApiResponse>;
  /** Set when the variant must not be sent (safety.ts rule 3): it is recorded as Blocked with this reason. */
  notSent?: string;
}

/**
 * Run the variants of a baseline-backed case. Record mode writes the recording and marks the test "recorded";
 * otherwise each variant must match the approved file: same status, same shape, no new or missing PII keys.
 * `check` runs the case's own invariants on every reply (e.g. no 5xx, no echoed PII) in both modes.
 */
export async function withBaseline(
  caseId: string,
  ctx: { runId: string; record: boolean },
  variants: Variant[],
  check: (label: string, res: ApiResponse) => void = () => {},
): Promise<void> {
  const approved = existsSync(approvedFile(caseId))
    ? (JSON.parse(readFileSync(approvedFile(caseId), 'utf8')) as BaselineFile)
    : undefined;
  if (!ctx.record && !approved?.approved) blockPrereq(PREREQ.baseline.id, PREREQ.baseline.reason);
  const seen: Record<string, Observation> = {};
  // Record mode: every variant is recorded even when one breaks an invariant (e.g. a 5xx); the failure is raised
  // AFTER the recording is written, so the review sees the full picture and the test still fails.
  const broken: { label: string; error: unknown }[] = [];
  const notSent: Record<string, string> = {};
  for (const v of variants.filter((x) => x.notSent)) {
    notSent[v.label] = v.notSent!;
    test
      .info()
      .annotations.push({ type: 'blocked-variant', description: `${v.label}: NOT SENT — ${v.notSent}` });
  }
  if (!ctx.record && approved?.reRecord)
    test.info().annotations.push({
      type: 'assumption',
      description: `Approved baseline marked for re-recording: ${approved.reRecord} (npm run m2:contracts:record, then approve).`,
    });
  const toSend = variants.filter((x) => !x.notSent);
  if (!toSend.length) blockPrereq(PREREQ.unsafeVariants.id, PREREQ.unsafeVariants.reason);
  for (const v of toSend) {
    const res = await test.step(v.label, v.send);
    seen[v.label] = observe(res);
    if (ctx.record) {
      try {
        check(v.label, res);
      } catch (error) {
        broken.push({ label: v.label, error });
      }
    } else check(v.label, res);
    if (!ctx.record) {
      const want = approved!.variants[v.label];
      expect(want !== undefined, `${v.label}: variant exists in the approved baseline`).toBe(true);
      const accepted = invalidAcceptedProblem(caseId, v.label, res.status, approved);
      expect(accepted === undefined, `${v.label}: ${accepted ?? 'ok'}`).toBe(true);
      if (isInvalidVariant(caseId, v.label) && approved!.acceptedBecause?.[v.label])
        test.info().annotations.push({
          type: 'assumption',
          description: `${v.label}: 2xx accepted — ${approved!.acceptedBecause[v.label]}`,
        });
      expect(res.status, `${v.label}: status as in the approved baseline`).toBe(want!.status);
      expect(
        shapeDiff(want!.shape, seen[v.label]!.shape),
        `${v.label}: same keys and types as the baseline`,
      ).toEqual([]);
      const pii = piiKeyDiff(want!, seen[v.label]!);
      for (const n of pii.notes)
        test.info().annotations.push({ type: 'assumption', description: `${v.label}: ${n}` });
      expect(pii.failures, `${v.label}: no new PII key, none missing outside lists (names only)`).toEqual([]);
    }
  }
  if (ctx.record) {
    const file: BaselineFile = {
      caseId,
      recordedAt: new Date().toISOString(),
      runId: ctx.runId,
      build: 'unknown — deployed commit not confirmed (M2Q-01)',
      note: 'Staging recording for review. Approve with npm run m2:contracts:approve.',
      variants: seen,
      ...(broken.length ? { invariantFailures: broken.map((b) => b.label) } : {}),
      ...(Object.keys(notSent).length ? { notSent } : {}),
    };
    mkdirSync(path.dirname(recordedFile(caseId)), { recursive: true });
    writeFileSync(recordedFile(caseId), `${JSON.stringify(file, null, 2)}\n`);
    test.info().annotations.push({
      type: 'recorded',
      description: `Baseline recorded: m2/contracts/recorded/${caseId}.json`,
    });
    if (broken.length) throw broken[0]!.error;
    test.skip(true, `RECORDED baseline for ${caseId} (review and approve before it is asserted)`);
  }
}
