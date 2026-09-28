/**
 * Builds PENDING-PLACEHOLDERS.md — every dummy placeholder waiting on the PII backend team, and exactly where it is.
 *
 *   npm run docs:pending
 *
 * Everything is read from the real files, so the list cannot drift:
 *   1. settings        .env.example                      values starting with PENDING_
 *   2. database SQL    config/db-queries.example.json    PENDING_ table / column names
 *   3. tests waiting   tests/**                           blockedBy('Q-xx', …)  → the test does not run yet
 *   4. temporary       tests/**                           other 'Q-xx' references → the test runs, but accepts
 *      expectations                                         several answers until the question is answered
 *   5. CI settings     .github/workflows/*.yml           ${{ vars.X }} / ${{ secrets.X }}
 * A unit test (UT-DOC-001) fails if the file is out of date.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
export const PENDING_DOC = path.join(ROOT, 'PENDING-PLACEHOLDERS.md');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/** Who provides each setting and what it unblocks. A PENDING_ setting without an entry here fails the build. */
const SETTINGS: Record<string, { from: string; unblocks: string }> = {
  PII_ENVIRONMENT: {
    from: 'Backend / DevOps',
    unblocks: 'Labels reports and CI runs with the right environment (local / dev / qa / staging)',
  },
  PII_BASE_URL: {
    from: 'Backend / DevOps',
    unblocks: 'All 133 service tests (address of the test environment)',
  },
  PII_CALLER_PRIMARY_ID: {
    from: 'Backend (register our primary public key)',
    unblocks: 'All service tests (full-permission caller)',
  },
  PII_CALLER_SECONDARY_ID: {
    from: 'Backend (register our secondary public key)',
    unblocks: 'Ownership tests: another caller cannot use my keys / temporary phones',
  },
  PII_CALLER_LIMITED_ID: {
    from: 'Backend (register our limited public key with the restricted permissions)',
    unblocks: '12 permission tests (PII-AZ-*)',
  },
  PII_TEST_EMAIL_DOMAIN: {
    from: 'Backend / Security',
    unblocks: 'Every test that saves or searches an email',
  },
  PII_TEST_PHONES: {
    from: 'QA lead / Backend',
    unblocks: 'Phone, search-by-phone and temporary-phone tests (2+ approved 10-digit numbers)',
  },
  PII_NON_SEARCHABLE_FIELD: { from: 'Backend (Q-18)', unblocks: 'PII-SR-012' },
  PII_BATCH_MAX_ITEMS: {
    from: 'Backend',
    unblocks: 'PII-BR-004 / BR-005 use the real limit (guide value 50 until then)',
  },
  PII_SEARCH_DEFAULT_LIMIT: {
    from: 'Backend',
    unblocks: 'PII-SR-008 uses the real default (guide value 10 until then)',
  },
  PII_TRANSIENT_TTL_MIN_SECONDS: {
    from: 'Backend',
    unblocks: 'PII-TR-008 uses the real minimum (guide value 300 until then)',
  },
  PII_TRANSIENT_TTL_MAX_SECONDS: {
    from: 'Backend',
    unblocks: 'PII-TR-008 uses the real maximum (guide value 604800 until then)',
  },
  PII_MAX_BODY_BYTES: { from: 'Backend (Q-22)', unblocks: 'PII-SEC-002' },
  PII_ENABLE_TTL_EXPIRY_TEST: {
    from: 'Backend (Q-12): a short-lifetime environment',
    unblocks: 'PII-TR-012',
  },
  PII_SIGNATURE_HELPER_MUST_BE_DISABLED: { from: 'Backend (Q-23)', unblocks: 'PII-SEC-003' },
  DB_ENGINE: { from: 'Backend / DBA (Q-03)', unblocks: 'All @db tests and the POC database step' },
  DB_HOST: { from: 'Backend / DBA', unblocks: 'All @db tests' },
  DB_PORT: { from: 'Backend / DBA', unblocks: 'All @db tests' },
  DB_NAME: { from: 'Backend / DBA', unblocks: 'All @db tests' },
  DB_USER: { from: 'Backend / DBA (read-only user)', unblocks: 'All @db tests' },
  DB_PASSWORD: { from: 'Backend / DBA (read-only user)', unblocks: 'All @db tests' },
};

/** How each waiting test gets unblocked (checked against the test code: see the blockedBy conditions). */
const UNBLOCK: Record<string, string> = {
  'Q-12':
    'Set `PII_ENABLE_TTL_EXPIRY_TEST=true` in `.env` — only in an environment with a short minimum lifetime',
  'Q-14': 'Code change once Dev confirms Phase 1 vs Phase 2 (Q-38) — see the `PENDING_Q14_ANSWER` marker',
  'Q-17': 'Code change after Dev provides a not-ready hook — see the `PENDING_Q17_ANSWER` marker',
  'Q-18': 'Set `PII_NON_SEARCHABLE_FIELD` in `.env`',
  'Q-21': 'Code change once Dev confirms Phase 1 vs Phase 2 (Q-38) — see the `PENDING_Q21_ANSWER` marker',
  'Q-22':
    'Set `PII_MAX_BODY_BYTES` in `.env` (now 1048576 from tech doc v3 §12.4 — runs once the service is reachable)',
  'Q-23': 'Set `PII_SIGNATURE_HELPER_MUST_BE_DISABLED=true` in `.env` (non-development environments)',
  'Q-24': 'Nothing — runs automatically when the service exposes `/openapi.json`',
  'Q-26':
    'Read-only MongoDB access (audit is in MongoDB per tech doc v3 §39) + a Mongo check in the framework — Q-35',
};

/** Code markers (`// PENDING_…`) left in test files where a code change is needed. */
function codeMarkers(): { marker: string; file: string; line: number; note: string }[] {
  const out: { marker: string; file: string; line: number; note: string }[] = [];
  for (const file of testFiles()) {
    const lines = read(file).split('\n');
    lines.forEach((text, i) => {
      const m = /\/\/\s*(PENDING_[A-Z0-9_]+):\s*(.*)$/.exec(text);
      if (!m) return;
      // The note continues on the following "//" lines.
      const parts = [(m[2] as string).trim()];
      for (let j = i + 1; j < lines.length; j++) {
        const next = /^\s*\/\/\s?(.*)$/.exec(lines[j] as string);
        if (!next) break;
        parts.push((next[1] as string).trim());
      }
      out.push({ marker: m[1] as string, file, line: i + 1, note: parts.join(' ') });
    });
  }
  return out;
}

/** Short question text from docs/known-gaps-and-questions.md (first bold phrase, or the first sentence). */
function questionTexts(): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of read('docs/known-gaps-and-questions.md').split('\n')) {
    const m = /^\|\s*(Q-\d+)\s*\|\s*(.+?)\s*\|/.exec(line);
    if (!m) continue;
    const text = (m[2] as string).replace(/\*\*/g, '').replace(/`/g, '');
    out.set(m[1] as string, text.length > 110 ? `${text.slice(0, 107).trimEnd()}…` : text);
  }
  return out;
}

function testFiles(dir = 'tests'): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return rel === 'tests/unit' ? [] : testFiles(rel);
    return e.name.endsWith('.spec.ts') ? [rel] : [];
  });
}

interface QRef {
  q: string;
  file: string;
  line: number;
  test: string;
  waiting: boolean;
}

function questionRefs(): QRef[] {
  const refs: QRef[] = [];
  for (const file of testFiles()) {
    const lines = read(file).split('\n');
    lines.forEach((text, i) => {
      for (const m of text.matchAll(/'(Q-\d+)'/g)) {
        // The enclosing test: nearest line above that opens a test with an ID.
        let test = '';
        for (let j = i; j >= 0 && !test; j--) {
          const t = /(?:test\(\s*|^\s*)[`']((?:PII-[A-Z]+|POC)-\d+[a-z]?)/.exec(lines[j] as string);
          if (t && /test\(|^\s*[`']/.test(lines[j] as string)) test = t[1] as string;
        }
        const around = lines.slice(Math.max(0, i - 2), i + 1).join(' ');
        refs.push({ q: m[1] as string, file, line: i + 1, test, waiting: /blockedBy\(/.test(around) });
      }
    });
  }
  // One row per question + test + kind (the same call often mentions the question twice).
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = `${r.q}|${r.test}|${r.waiting}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const esc = (s: string) => s.replace(/\|/g, '\\|');
const byQ = (a: QRef, b: QRef) =>
  a.q.localeCompare(b.q, undefined, { numeric: true }) ||
  a.test.localeCompare(b.test, undefined, { numeric: true });

export function buildPendingDoc(): string {
  const out: string[] = [];
  const push = (...l: string[]) => out.push(...l);
  const questions = questionTexts();

  // 1. Settings
  const envLines = read('.env.example').split('\n');
  const settings = envLines
    .map((l, i) => ({ m: /^([A-Z0-9_]+)=(PENDING_[A-Z0-9_]+)(?:\s+#\s*\[(.*)\])?/.exec(l), line: i + 1 }))
    .filter((x) => x.m)
    .map(({ m, line }) => ({ key: m![1] as string, value: m![2] as string, fallback: m![3] ?? '', line }));
  const missing = settings.filter((s) => !SETTINGS[s.key]).map((s) => s.key);
  if (missing.length)
    throw new Error(`Add ${missing.join(', ')} to SETTINGS in scripts/generate-pending-doc.ts`);

  // 2. Database template
  const dbLines = read('config/db-queries.example.json').split('\n');
  const dbTokens = new Map<string, number>();
  dbLines.forEach((l, i) => {
    for (const m of l.matchAll(/PENDING_[A-Z_]+/g)) if (!dbTokens.has(m[0])) dbTokens.set(m[0], i + 1);
  });

  // 3 + 4. Tests
  const refs = questionRefs();
  const waiting = refs.filter((r) => r.waiting).sort(byQ);
  const temporary = refs.filter((r) => !r.waiting).sort(byQ);

  // 5. CI
  const ciFiles = readdirSync(path.join(ROOT, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f));
  const ci = new Map<string, { kind: string; where: string }>();
  for (const f of ciFiles) {
    read(`.github/workflows/${f}`)
      .split('\n')
      .forEach((l, i) => {
        for (const m of l.matchAll(/\$\{\{\s*(vars|secrets)\.([A-Z0-9_]+)/g)) {
          if (m[2] === 'GITHUB_TOKEN' || ci.has(m[2] as string)) continue;
          ci.set(m[2] as string, {
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
    'Everything the framework still needs from the PII backend team is a **dummy placeholder** that starts with',
    '`PENDING_`. The framework treats a `PENDING_` value as **not set**: it is never sent to the service or the',
    'database, and tests that need it fail with a clear "missing setting" message (or show as **Waiting**).',
    '',
    '**To resolve one:** put the real value in your `.env` (or `config/db-queries.json`, or the GitHub',
    'environment), then run `npm run check-env`. Find any leftover with `grep -rn PENDING_ .env config tests`.',
    '',
    '## Everything required — checklist',
    '',
    '**From Dev (values):**',
    '',
    `1. [ ] Test environment URL and environment name, plus VPN / network access — section 1`,
    `2. [ ] Three caller IDs, after registering our three public keys — section 1`,
    `3. [ ] Two non-production tenant IDs, an approved email domain, and 2–3 approved 10-digit test phone numbers — section 1`,
    `4. [ ] Environment limits: bulk-read size, search default, temporary-phone lifetime, max body size — section 1`,
    `5. [ ] Database: type, host, port, name, a read-only login — section 1`,
    `6. [ ] Database table and column names (${dbTokens.size} placeholders) — section 2`,
    `7. [ ] Answers to the open questions behind ${waiting.length} waiting tests and ${temporary.length} temporary expectations — sections 3–4`,
    '',
    '**From Dev (confirmations, not values):**',
    '',
    '8. [ ] The three callers have exactly the permissions in [setup-guide §4](docs/setup-guide.md) (the 12 permission tests depend on it)',
    '9. [ ] The approved test phone numbers are accepted by the service as valid',
    '10. [ ] The test environment is reachable from our machines and from CI (VPN, firewall, HTTPS certificate)',
    '11. [ ] The database accepts connections from our machines and CI, and whether it needs SSL (`DB_SSL`, default `true`)',
    '',
    '**On our side:**',
    '',
    '12. [ ] `cp .env.example .env` and replace every `PENDING_` value',
    '13. [ ] `npm run keys:generate -- secrets/primary-caller` (and `secondary-caller`, `limited-caller`); send the three `.pub.pem` files to Dev',
    '14. [ ] `cp config/db-queries.example.json config/db-queries.json` and replace every `PENDING_` name; keep `DB_QUERIES_FILE=config/db-queries.json`',
    `15. [ ] Replace the ${codeMarkers().length} code placeholders once their questions are answered — section 6`,
    '16. [ ] Add the CI variables and secrets to the GitHub environment — section 5',
    '17. [ ] Run `npm run check-env` → `npm run test:poc` → `npm run test:smoke` → `npm run test:all`, and triage the first run with Dev',
    '',
    `| Group | Count | Where |`,
    `|---|:-:|---|`,
    `| [1. Settings](#1-settings-env) | ${settings.length} | \`.env.example\` → your \`.env\` |`,
    `| [2. Database names](#2-database-table-and-column-names) | ${dbTokens.size} | \`config/db-queries.example.json\` → \`config/db-queries.json\` |`,
    `| [3. Tests waiting on an answer](#3-tests-waiting-on-an-answer-do-not-run-yet) | ${waiting.length} | test files |`,
    `| [4. Temporary expectations](#4-temporary-expectations-run-but-accept-several-answers) | ${temporary.length} | test files |`,
    `| [5. CI settings](#5-ci-settings-github-environment) | ${ci.size} | GitHub → Settings → Environments |`,
    `| [6. Code placeholders](#6-code-placeholders-in-tests) | ${codeMarkers().length} | test files (\`// PENDING_…\` comments) |`,
    '',
    '## 1. Settings (`.env`)',
    '',
    'Copy `.env.example` to `.env`, then replace each value below.',
    '',
    '| Setting | Placeholder | Where | Needed from | Unblocks | Used until then |',
    '|---|---|---|---|---|---|',
    ...settings.map((s) => {
      const meta = SETTINGS[s.key] as { from: string; unblocks: string };
      return `| \`${s.key}\` | \`${s.value}\` | \`.env.example:${s.line}\` | ${esc(meta.from)} | ${esc(meta.unblocks)} | ${s.fallback ? `\`${s.fallback}\`` : '— (not set)'} |`;
    }),
    '',
    '**Also on our side (not a placeholder):** after the caller IDs arrive, create the three key pairs with',
    '`npm run keys:generate -- secrets/<primary|secondary|limited>-caller` and send the `.pub.pem` files to the',
    'backend team. The key-file paths in `.env.example` already point to `secrets/…-caller.pem`.',
    '',
    '## 2. Database table and column names',
    '',
    'Copy `config/db-queries.example.json` to `config/db-queries.json` and replace each name with the real one',
    '(Q-03). A query that still contains `PENDING_` counts as not configured and is never run.',
    '',
    '| Placeholder | First used at | Meaning |',
    '|---|---|---|',
    ...[...dbTokens].map(([tok, line]) => {
      const name = tok.replace(/^PENDING_/, '').toLowerCase();
      const meaning = name.endsWith('_table')
        ? `table: ${name.replace(/_table$/, '').replace(/_/g, ' ')}`
        : `column: ${name.replace(/_col$/, '').replace(/_/g, ' ')}`;
      return `| \`${tok}\` | \`config/db-queries.example.json:${line}\` | ${meaning} |`;
    }),
    '',
    '## 3. Tests waiting on an answer (do not run yet)',
    '',
    'Each is a `blockedBy(…)` call. The test shows as **Waiting** until the answer arrives; then replace the call',
    'with the real check (or set the matching setting from section 1).',
    '',
    '| Question | Test | Where | What we need to know | How it gets unblocked |',
    '|---|---|---|---|---|',
    ...waiting.map(
      (r) =>
        `| ${r.q} | ${r.test || '—'} | \`${r.file}:${r.line}\` | ${esc(questions.get(r.q) ?? '')} | ${esc(UNBLOCK[r.q] ?? 'Answer from Dev')} |`,
    ),
    '',
    '## 4. Temporary expectations (run, but accept several answers)',
    '',
    'The guide does not say exactly what the service returns here, so the test accepts every reasonable answer',
    '(for example "400 or 422"). When the question is answered, narrow the check to the exact answer.',
    '',
    '| Question | Test | Where | What we need to know |',
    '|---|---|---|---|',
    ...temporary.map(
      (r) => `| ${r.q} | ${r.test || '—'} | \`${r.file}:${r.line}\` | ${esc(questions.get(r.q) ?? '')} |`,
    ),
    '',
    '## 5. CI settings (GitHub environment)',
    '',
    'Set these in GitHub → Settings → Environments → `qa` before running the integration job.',
    '',
    '| Name | Type | Used at |',
    '|---|---|---|',
    ...[...ci].map(([name, v]) => `| \`${name}\` | ${v.kind} | \`${v.where}\` |`),
    '',
    '## 6. Code placeholders in tests',
    '',
    'These tests cannot be finished with a setting: the expected behaviour itself is unknown. Each has a',
    '`// PENDING_…` comment saying what to write once Dev answers.',
    '',
    '| Marker | Where | What to do |',
    '|---|---|---|',
    ...codeMarkers().map((m) => `| \`${m.marker}\` | \`${m.file}:${m.line}\` | ${esc(m.note)} |`),
    '',
  );
  return out.join('\n');
}

if (require.main === module) {
  writeFileSync(PENDING_DOC, buildPendingDoc());
  console.log(`Written ${path.relative(ROOT, PENDING_DOC)}`);
}
