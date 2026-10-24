/**
 * Approves reviewed contract recordings into m2/contracts/approved/ (tests assert only against approved files).
 *
 *   npm run m2:contracts:approve -- --by "Parul" M2-API-013-CONTRACT M2-API-021-PARAM
 *   npm run m2:contracts:approve -- --by "Parul" all
 *
 * - No approved file yet: the recording is copied with {approved: {by, on}}.
 * - Approved file exists (2026-10-24): the recording is MERGED into it — union of key/type shapes and PII key names
 *   per variant (data-dependent list contents accumulate instead of flip-flopping); a changed status takes the new
 *   recording. Nothing is written when the merge changes nothing, so re-approving does not churn the files.
 * - Variants that broke an invariant while recording (e.g. a 5xx — invalid JSON → 502) are NEVER approved: they stay
 *   failing as findings. A recorded server error (status ≥ 500) is never approved either, even when the recording
 *   does not list it (recordings made before REPEAT / STATE had the no-server-error invariant, 2026-10-24).
 * - Variants that must never be sent (safety rule, M2Q-46: a removed / blanked target, phone or login-OTP key) are
 *   NEVER approved — whether the recording marks them "notSent" or is an older recording that still contains them.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  approvableVariants,
  approvedFile,
  CONTRACTS_DIR,
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
const byIdx = args.indexOf('--by');
const by = byIdx >= 0 ? args[byIdx + 1] : undefined;
const ids = args.filter((a, i) => a !== '--by' && i !== byIdx + 1);
if (!by || !ids.length) {
  console.error('Usage: npm run m2:contracts:approve -- --by "<name>" <case…|all>');
  process.exit(1);
}
const recordedDir = path.join(CONTRACTS_DIR, 'recorded');
const all = existsSync(recordedDir)
  ? readdirSync(recordedDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
  : [];
const chosen = ids.includes('all') ? all : ids;
const on = new Date().toISOString().slice(0, 10);

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
  const variants: Record<string, Observation> = { ...(old?.approved ? old.variants : {}) };
  // An approved variant that is now never sent (safety rule) is dropped from the approved file too.
  for (const label of Object.keys(variants))
    if (api && unsafeVariantLabel(api, label)) delete variants[label];
  for (const [label, obs] of Object.entries(approve)) variants[label] = merge(variants[label], obs);
  if (old?.approved && JSON.stringify(old.variants) === JSON.stringify(variants)) {
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
  };
  mkdirSync(path.dirname(approvedFile(id)), { recursive: true });
  writeFileSync(approvedFile(id), `${JSON.stringify(file, null, 2)}\n`);
  written++;
}
console.log(`Approved ${written} baseline(s) by ${by}; ${unchanged} already matched (not rewritten).`);
