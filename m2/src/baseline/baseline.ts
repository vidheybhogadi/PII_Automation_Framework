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
 *   4. ASSERT — normal runs compare only against approved files; no approved file → Blocked (M2Q-24).
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
  approved?: { by: string; on: string };
}

export const CONTRACTS_DIR = path.join(ROOT, 'm2/contracts');
export const recordedFile = (caseId: string) => path.join(CONTRACTS_DIR, 'recorded', `${caseId}.json`);
export const approvedFile = (caseId: string) => path.join(CONTRACTS_DIR, 'approved', `${caseId}.json`);

/** Recursive key/type shape. Arrays: merged shape of their elements; null stays "null". */
export function shapeOf(v: unknown): Shape {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) {
    if (!v.length) return [];
    const merged = v.map(shapeOf).reduce((a, b) => mergeShapes(a, b));
    return [merged];
  }
  if (typeof v === 'object') {
    const out: Record<string, Shape> = {};
    for (const k of Object.keys(v as object).sort()) out[k] = shapeOf((v as Record<string, unknown>)[k]);
    return out;
  }
  return typeof v;
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

/**
 * Differences between an approved shape and a live one, as value-free paths ("$.profile.first_name: missing").
 * "null" matches any type (nullable fields); empty arrays are not compared element-wise.
 */
export function shapeDiff(expected: Shape, actual: Shape, at = '$'): string[] {
  if (expected === 'null' || actual === 'null') return [];
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return [`${at}: type changed`];
    if (!expected.length || !actual.length) return [];
    return shapeDiff(expected[0]!, actual[0]!, `${at}[]`);
  }
  if (typeof expected === 'object' || typeof actual === 'object') {
    if (typeof expected !== 'object' || typeof actual !== 'object') return [`${at}: type changed`];
    const out: string[] = [];
    for (const k of Object.keys(expected)) {
      if (!(k in actual)) out.push(`${at}.${k}: missing`);
      else out.push(...shapeDiff(expected[k]!, actual[k]!, `${at}.${k}`));
    }
    for (const k of Object.keys(actual)) if (!(k in expected)) out.push(`${at}.${k}: new key`);
    return out;
  }
  return expected === actual ? [] : [`${at}: ${expected} → ${actual}`];
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
  for (const v of variants) {
    const res = await test.step(v.label, v.send);
    seen[v.label] = observe(res);
    check(v.label, res);
    if (!ctx.record) {
      const want = approved!.variants[v.label];
      expect(want !== undefined, `${v.label}: variant exists in the approved baseline`).toBe(true);
      expect(res.status, `${v.label}: status as in the approved baseline`).toBe(want!.status);
      expect(
        shapeDiff(want!.shape, seen[v.label]!.shape),
        `${v.label}: same keys and types as the baseline`,
      ).toEqual([]);
      expect(
        seen[v.label]!.piiKeys,
        `${v.label}: same PII keys as the baseline (no new, none missing)`,
      ).toEqual(want!.piiKeys);
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
    };
    mkdirSync(path.dirname(recordedFile(caseId)), { recursive: true });
    writeFileSync(recordedFile(caseId), `${JSON.stringify(file, null, 2)}\n`);
    test.info().annotations.push({
      type: 'recorded',
      description: `Baseline recorded: m2/contracts/recorded/${caseId}.json`,
    });
    test.skip(true, `RECORDED baseline for ${caseId} (review and approve before it is asserted)`);
  }
}
