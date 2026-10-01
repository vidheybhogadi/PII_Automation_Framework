/**
 * Builds PENDING-PLACEHOLDERS.md — everything still owed by the backend team, and exactly where it is used.
 *
 *   npm run docs:pending
 *
 * Everything is read from the real files, so the list cannot drift:
 *   1. settings        .env.example                      values starting with PENDING_
 *   2. database SQL    config/db-queries.example.json    PENDING_ table / column names
 *   3. blocked tests   tests/**                           BQ-xx references, BLOCKERS.*, requireApprovedPhones, `db`
 *   4. questions       docs/backend-open-questions.md    the BQ-xx table rows
 *   5. CI settings     .github/workflows/*.yml           ${{ vars.X }} / ${{ secrets.X }}
 * A unit test (UT-DOC-001) fails if the file is out of date.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
export const PENDING_DOC = path.join(ROOT, 'PENDING-PLACEHOLDERS.md');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/** Who provides each PENDING_ setting and what it unblocks. A PENDING_ setting without an entry fails the build. */
const SETTINGS: Record<string, { from: string; unblocks: string }> = {
  AISLE_TEST_PHONES: {
    from: 'QA lead / Aisle backend (BQ-03)',
    unblocks: 'Phone normalization and temporary-phone tests (approved numbers only)',
  },
  DB_HOST: { from: 'Aisle backend / DBA (BQ-04)', unblocks: 'All @db tests and POC-003' },
  DB_PORT: { from: 'Aisle backend / DBA (BQ-04)', unblocks: 'All @db tests and POC-003' },
  DB_NAME: { from: 'Aisle backend / DBA (BQ-04)', unblocks: 'All @db tests and POC-003' },
  DB_USER: { from: 'Aisle backend / DBA (BQ-04, read-only user)', unblocks: 'All @db tests and POC-003' },
  DB_PASSWORD: { from: 'Aisle backend / DBA (BQ-04, read-only user)', unblocks: 'All @db tests and POC-003' },
};

/** Runtime blockers used in tests (src/fixtures/steps.ts BLOCKERS) → question ID. */
const BLOCKER_IDS: Record<string, string> = {
  transient: 'BQ-02',
  phone: 'BQ-03',
};

const TEST_ID = /(POC-\d{3}|AISLE-[A-Z]+-\d{3})/;

function testFiles(dir = 'tests'): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return rel === 'tests/unit' || rel === 'tests/catalog' ? [] : testFiles(rel);
    return e.name.endsWith('.spec.ts') ? [rel] : [];
  });
}

export interface BlockedTest {
  id: string;
  file: string;
  line: number;
  questions: string[];
  kind: 'static' | 'runtime';
}

/** Every test that can be blocked, with the questions it waits on. */
export function blockedTests(): BlockedTest[] {
  const out: BlockedTest[] = [];
  for (const file of testFiles()) {
    const lines = read(file).split('\n');
    const starts: { id: string; line: number }[] = [];
    lines.forEach((l, i) => {
      const window = `${l} ${lines[i + 1] ?? ''}`;
      const m = TEST_ID.exec(window);
      if (/\btest\(/.test(l) && m) starts.push({ id: m[1] as string, line: i });
    });
    starts.forEach((s, k) => {
      const body = lines.slice(s.line, starts[k + 1]?.line ?? lines.length).join('\n');
      const qs = new Set<string>();
      for (const m of body.matchAll(/'(BQ-\d+)'/g)) qs.add(m[1] as string);
      for (const m of body.matchAll(/BLOCKERS\.(\w+)/g)) {
        const id = BLOCKER_IDS[m[1] as string];
        if (id) qs.add(id);
      }
      if (/requireApprovedPhones\(/.test(body)) qs.add('BQ-03');
      const signature = body.slice(0, body.indexOf('=>') > 0 ? body.indexOf('=>') : 0);
      if (/[{,]\s*db\s*[,}]/.test(signature)) qs.add('BQ-04');
      if (qs.size === 0) return;
      out.push({
        id: s.id,
        file,
        line: s.line + 1,
        questions: [...qs].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        kind: /blockedBy\(/.test(body) ? 'static' : 'runtime',
      });
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** BQ-xx → { question, status } from docs/backend-open-questions.md. */
export function questions(): Map<string, { text: string; status: string }> {
  const map = new Map<string, { text: string; status: string }>();
  for (const line of read('docs/backend-open-questions.md').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const id = cells[1] ?? '';
    if (!/^BQ-\d+$/.test(id)) continue;
    const text = (cells[2] ?? '').replace(/\*\*/g, '');
    map.set(id, {
      text: text.length > 150 ? `${text.slice(0, 147)}…` : text,
      status: cells[cells.length - 2] ?? '',
    });
  }
  return map;
}

const esc = (s: string) => s.replace(/\|/g, '\\|');

export function buildPendingDoc(): string {
  const out: string[] = [];
  const push = (...l: string[]) => out.push(...l);
  const qs = questions();

  // 1. Settings
  const settings = read('.env.example')
    .split('\n')
    .map((l, i) => ({ m: /^([A-Z0-9_]+)=(PENDING_[A-Z0-9_]+)/.exec(l), line: i + 1 }))
    .filter((x): x is { m: RegExpExecArray; line: number } => x.m !== null)
    .map(({ m, line }) => ({ key: m[1] as string, value: m[2] as string, line }));
  const missing = settings.filter((s) => !SETTINGS[s.key]).map((s) => s.key);
  if (missing.length)
    throw new Error(`Add ${missing.join(', ')} to SETTINGS in scripts/generate-pending-doc.ts`);

  // 2. Database template
  const dbTokens = new Map<string, number>();
  read('config/db-queries.example.json')
    .split('\n')
    .forEach((l, i) => {
      for (const m of l.matchAll(/PENDING_[A-Z_]+/g)) if (!dbTokens.has(m[0])) dbTokens.set(m[0], i + 1);
    });

  // 3. Blocked tests
  const blocked = blockedTests();

  // 5. CI
  const ci = new Map<string, { kind: string; where: string }>();
  for (const f of readdirSync(path.join(ROOT, '.github/workflows')).filter((x) => /\.ya?ml$/.test(x))) {
    read(`.github/workflows/${f}`)
      .split('\n')
      .forEach((l, i) => {
        for (const m of l.matchAll(/\$\{\{\s*(vars|secrets)\.([A-Z0-9_]+)/g)) {
          const name = m[2] as string;
          if (name === 'GITHUB_TOKEN' || ci.has(name)) continue;
          ci.set(name, {
            kind: m[1] === 'vars' ? 'Variable' : 'Secret',
            where: `.github/workflows/${f}:${i + 1}`,
          });
        }
      });
  }

  push(
    '<!-- GENERATED by `npm run docs:pending` from the files listed below. Do not edit by hand. -->',
    '',
    '# Pending placeholders',
    '',
    'Architecture under test: **QA automation → Aisle PII facade → PII service → PII DB**.',
    '',
    'Everything the framework still needs from the backend team is either a **dummy placeholder** starting with',
    '`PENDING_` (treated as **not set**, never sent anywhere) or an **open question** in',
    '[docs/backend-open-questions.md](docs/backend-open-questions.md). Tests that depend on one show as',
    '**Blocked** in the report with the question ID — never as passed or failed.',
    '',
    '**To resolve one:** put the real value in your `.env` (or `config/db-queries.json`, or the GitHub',
    'environment), then run `npm run check-env`.',
    '',
    '## Checklist',
    '',
    '1. [ ] Temporary-phone access confirmed for the Aisle caller (BQ-02)',
    '2. [ ] Approved test phone numbers (BQ-03) — section 1',
    `3. [ ] Read-only DB access and the PII table/column layout (BQ-04) — sections 1–2 (${dbTokens.size} DB placeholders)`,
    `4. [ ] Answers to the open questions behind ${blocked.length} blockable tests — sections 3–4`,
    '',
    '## 1. Settings (`.env.example`)',
    '',
    '| Setting | Placeholder | Where | From | Unblocks |',
    '|---|---|---|---|---|',
    ...settings.map((s) => {
      const info = SETTINGS[s.key] as { from: string; unblocks: string };
      return `| \`${s.key}\` | \`${s.value}\` | \`.env.example:${s.line}\` | ${info.from} | ${info.unblocks} |`;
    }),
    '',
    '## 2. Database query template (`config/db-queries.example.json`)',
    '',
    'Copy to `config/db-queries.json` and replace every placeholder with names Dev confirms. A query that still',
    'contains `PENDING_` counts as not configured and never runs.',
    '',
    ...(dbTokens.size
      ? [
          '| Placeholder | Where |',
          '|---|---|',
          ...[...dbTokens].map(([t, line]) => `| \`${t}\` | \`config/db-queries.example.json:${line}\` |`),
        ]
      : ['_No placeholders._']),
    '',
    '## 3. Tests that can be blocked',
    '',
    '**static** = not run until the question is answered (`blockedBy`). **runtime** = runs, and marks itself',
    'Blocked only if staging still denies access (403) or the setting is missing — then runs for real once fixed.',
    '',
    ...(blocked.length
      ? [
          '| Test | Waits on | Kind | Where |',
          '|---|---|---|---|',
          ...blocked.map(
            (b) => `| ${b.id} | ${b.questions.join(', ')} | ${b.kind} | \`${b.file}:${b.line}\` |`,
          ),
        ]
      : ['_None._']),
    '',
    '## 4. Open questions',
    '',
    ...(qs.size
      ? [
          '| ID | Status | Question |',
          '|---|---|---|',
          ...[...qs].map(([id, q]) => `| ${id} | ${q.status} | ${esc(q.text)} |`),
        ]
      : ['✅ **All clear** — no open questions for the backend team. 🎉']),
    '',
    '## 5. CI settings (GitHub environment)',
    '',
    '| Name | Kind | Where |',
    '|---|---|---|',
    ...[...ci].map(([name, c]) => `| \`${name}\` | ${c.kind} | \`${c.where}\` |`),
    '',
  );
  return out.join('\n');
}

if (require.main === module) {
  writeFileSync(PENDING_DOC, buildPendingDoc());
  console.log(`Written ${path.relative(ROOT, PENDING_DOC)}`);
}
