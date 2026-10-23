/**
 * Approves reviewed contract recordings: copies m2/contracts/recorded/<case>.json to m2/contracts/approved/ with
 * {approved: {by, on}}. Tests assert only against approved files.
 *
 *   npm run m2:contracts:approve -- --by "Parul" M2-API-013-CONTRACT M2-API-021-PARAM
 *   npm run m2:contracts:approve -- --by "Parul" all
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { approvedFile, CONTRACTS_DIR, recordedFile, type BaselineFile } from '../src/baseline/baseline';

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
let n = 0;
for (const id of chosen) {
  if (!existsSync(recordedFile(id))) {
    console.error(`No recording for ${id} (run npm run m2:contracts:record first)`);
    continue;
  }
  const rec = JSON.parse(readFileSync(recordedFile(id), 'utf8')) as BaselineFile;
  mkdirSync(path.dirname(approvedFile(id)), { recursive: true });
  writeFileSync(
    approvedFile(id),
    `${JSON.stringify({ ...rec, approved: { by, on: new Date().toISOString().slice(0, 10) } }, null, 2)}\n`,
  );
  n++;
}
console.log(`Approved ${n} baseline(s) by ${by}.`);
