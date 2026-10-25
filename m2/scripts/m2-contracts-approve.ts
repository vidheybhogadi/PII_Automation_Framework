/**
 * Approves reviewed contract recordings into m2/contracts/approved/ (tests assert only against approved files).
 *
 *   npm run m2:contracts:approve -- --by "Parul" M2-API-013-CONTRACT M2-API-021-PARAM
 *   npm run m2:contracts:approve -- --by "Parul" all
 *   npm run m2:contracts:approve -- --by "Parul" --accept "without page=<code ref>" M2-API-005-PARAM
 *
 * - acceptedBecause (audit fix 2026-10-25): a 2xx reply to an INVALID-input variant (PARAM / BODY / STATE except
 *   "valid request") fails in normal runs unless the approved file names the code reference that makes the input
 *   optional / defaulted for that label. Add one with --accept "<label>=<code ref>" (one case at a time; works on an
 *   approved file without a new recording too). Existing entries are kept on every re-approval.
 * - No approved file yet: the recording is copied with {approved: {by, on}}.
 * - Approved file exists (2026-10-24): the recording is MERGED into it — union of key/type shapes and PII key names
 *   per variant (data-dependent list contents accumulate instead of flip-flopping); a changed status takes the new
 *   recording. Nothing is written when the merge changes nothing, so re-approving does not churn the files.
 * - Variants that broke an invariant while recording (e.g. a 5xx — invalid JSON → 502) are NEVER approved: they stay
 *   failing as findings. A recorded server error (status ≥ 500) is never approved either, even when the recording
 *   does not list it (recordings made before REPEAT / STATE had the no-server-error invariant, 2026-10-24).
 * - Approved file marked "reRecord" (known stale, e.g. recorded while a deleting route had already consumed its
 *   account): its variants are REPLACED by the recording, not merged, and the mark is dropped.
 * - Variants that must never be sent (safety rule, M2Q-46: a removed / blanked target, phone or login-OTP key) are
 *   NEVER approved — whether the recording marks them "notSent" or is an older recording that still contains them.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  approvableVariants,
  approvedFile,
  CONTRACTS_DIR,
  isInvalidVariant,
  recordedFile,
  unionShapes,
  type BaselineFile,
  type Observation,
} from '../src/baseline/baseline';
import { apiById } from '../src/design';
import { unsafeVariantLabel } from '../src/checks/safety';

/** The inventory API of a case id (M2-API-046-PARAM → API-046); undefined for scenario cases. */
function apiOfCase(caseId: string) {
  const m = caseId.match(/^M2-(API-\d+)-/);
  try {
    return m ? apiById(m[1]!) : undefined;
  } catch {
    return undefined;
  }
}

const args = process.argv.slice(2);
let by: string | undefined;
const ids: string[] = [];
/** --accept "<variant label>=<code ref>" (repeatable): see acceptedBecause in baseline.ts. */
const accepts: Record<string, string> = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--by') by = args[++i];
  else if (args[i] === '--accept') {
    const [label, ...ref] = (args[++i] ?? '').split('=');
    if (!label?.trim() || !ref.join('=').trim()) {
      console.error('--accept needs "<variant label>=<code ref>"');
      process.exit(1);
    }
    accepts[label.trim()] = ref.join('=').trim();
  } else ids.push(args[i]!);
}
if (!by || !ids.length) {
  console.error(
    'Usage: npm run m2:contracts:approve -- --by "<name>" [--accept "<variant>=<code ref>" …] <case…|all>',
  );
  process.exit(1);
}
const recordedDir = path.join(CONTRACTS_DIR, 'recorded');
const all = existsSync(recordedDir)
  ? readdirSync(recordedDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
  : [];
const chosen = ids.includes('all') ? all : ids;
if (Object.keys(accepts).length && (chosen.length !== 1 || ids.includes('all'))) {
  console.error('--accept applies to exactly one case: name it (not "all").');
  process.exit(1);
}
const on = new Date().toISOString().slice(0, 10);

/**
 * --accept for an already approved case without a new recording: only the acceptedBecause entry is added (each label
 * must be an invalid-input variant of the approved file).
 */
if (Object.keys(accepts).length && !existsSync(recordedFile(chosen[0]!))) {
  const id = chosen[0]!;
  if (!existsSync(approvedFile(id))) {
    console.error(`No approved baseline and no recording for ${id}`);
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(approvedFile(id), 'utf8')) as BaselineFile;
  for (const label of Object.keys(accepts))
    if (!file.variants[label] || !isInvalidVariant(id, label)) {
      console.error(`${id}: "${label}" is not an invalid-input variant of the approved baseline`);
      process.exit(1);
    }
  file.acceptedBecause = { ...(file.acceptedBecause ?? {}), ...accepts };
  writeFileSync(approvedFile(id), `${JSON.stringify(file, null, 2)}\n`);
  console.log(`${id}: acceptedBecause set for ${Object.keys(accepts).length} variant(s) by ${by}.`);
  process.exit(0);
}

function merge(old: Observation | undefined, rec: Observation): Observation {
  if (!old || old.status !== rec.status) return rec;
  return {
    status: rec.status,
    contentType: rec.contentType || old.contentType,
    shape: unionShapes(old.shape, rec.shape),
    piiKeys: [...new Set([...old.piiKeys, ...rec.piiKeys])].sort(),
  };
}

let written = 0;
let unchanged = 0;
for (const id of chosen) {
  if (!existsSync(recordedFile(id))) {
    console.error(`No recording for ${id} (run npm run m2:contracts:record first)`);
    continue;
  }
  const rec = JSON.parse(readFileSync(recordedFile(id), 'utf8')) as BaselineFile;
  const api = apiOfCase(id);
  const { approve, refused } = approvableVariants(rec, (label) =>
    api ? unsafeVariantLabel(api, label) : undefined,
  );
  for (const r of refused) console.error(`${id}: "${r.label}" ${r.why}`);
  const old = existsSync(approvedFile(id))
    ? (JSON.parse(readFileSync(approvedFile(id), 'utf8')) as BaselineFile)
    : undefined;
  // A stale approved file (reRecord) is replaced by the recording instead of merged.
  const variants: Record<string, Observation> = {
    ...(old?.approved && !old.reRecord ? old.variants : {}),
  };
  // An approved variant that is now never sent (safety rule) is dropped from the approved file too.
  for (const label of Object.keys(variants))
    if (api && unsafeVariantLabel(api, label)) delete variants[label];
  for (const [label, obs] of Object.entries(approve)) variants[label] = merge(variants[label], obs);
  // acceptedBecause survives every approval (kept for labels still in the file) and --accept adds to it.
  const acceptedBecause = Object.fromEntries(
    Object.entries({ ...(old?.acceptedBecause ?? {}), ...accepts }).filter(([label]) => label in variants),
  );
  for (const label of Object.keys(accepts))
    if (!(label in variants) || !isInvalidVariant(id, label))
      console.error(`${id}: --accept "${label}" ignored — not an invalid-input variant of this baseline`);
  const sameAccepted = JSON.stringify(old?.acceptedBecause ?? {}) === JSON.stringify(acceptedBecause);
  if (
    old?.approved &&
    !old.reRecord &&
    sameAccepted &&
    JSON.stringify(old.variants) === JSON.stringify(variants)
  ) {
    unchanged++;
    continue;
  }
  const history = [
    ...(old?.approvals ??
      (old?.approved ? [{ ...old.approved, recordedAt: old.recordedAt, runId: old.runId }] : [])),
    { by, on, recordedAt: rec.recordedAt, runId: rec.runId },
  ];
  const file: BaselineFile = {
    caseId: rec.caseId,
    recordedAt: rec.recordedAt,
    runId: rec.runId,
    build: rec.build,
    note: rec.note,
    variants,
    approved: { by, on },
    approvals: history,
    ...(Object.keys(acceptedBecause).length ? { acceptedBecause } : {}),
  };
  mkdirSync(path.dirname(approvedFile(id)), { recursive: true });
  writeFileSync(approvedFile(id), `${JSON.stringify(file, null, 2)}\n`);
  written++;
}
console.log(`Approved ${written} baseline(s) by ${by}; ${unchanged} already matched (not rewritten).`);
