/**
 * Generates the machine-wide master skill (~/.config/api-guide/SKILL.md — linked into Claude Code and Codex) from the
 * standing prompt docs/shared-api-docs-prompt.md, exactly as its §8.2a describes: the Agent Skills front matter, then
 * the prompt's sections copied verbatim — Purpose (without the first-run paragraph), §1 – §2A, §3.3 (applied to
 * added or changed endpoints) + §3.4, §4 – §7 (including §5A on changed and removed APIs) and §10.
 *
 *   npx tsx scripts/api-docs/master-skill.ts            write ~/.config/api-guide/SKILL.md (or API_GUIDE_SKILL)
 *   npx tsx scripts/api-docs/master-skill.ts --check    exit 1 when the installed skill differs from the prompt
 *   npx tsx scripts/api-docs/master-skill.ts --stdout   print it
 *
 * The prompt is the only source: edit docs/shared-api-docs-prompt.md, then run this (and `npm run docs:api:publish`
 * for the API_Guide copy).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const PROMPT = path.join(ROOT, 'docs/shared-api-docs-prompt.md');

const FRONT = `---
name: api-guide-docs
description: Use whenever an API, endpoint, route, API client or API document of an Aisle Network app (Aisle, Arike, Neene, Neetho, Anbe, Jilebi, HeyDil) is added, changed or removed in any project — file it under the right app in the shared API_Guide repo (vidheybhogadi/API_Guide, branch main). Never document APIs of anything else (other companies, public APIs, personal projects).
---

# Shared Aisle Network API documentation (api-guide-docs)

`;

/** The prompt split at its `## ` headings: heading line → text up to (not including) the next `## ` heading. */
function sections(prompt: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = prompt.split(/\n(?=## )/);
  for (const p of parts.slice(1)) out.set(p.split('\n')[0]!, p);
  return out;
}

const trimEnd = (s: string) => s.replace(/\s+$/, '');

export function masterSkill(prompt: string): string {
  const s = sections(prompt);
  const get = (prefix: string) => {
    const k = [...s.keys()].find((h) => h.startsWith(prefix));
    if (!k) throw new Error(`shared-api-docs-prompt.md has no section "${prefix}"`);
    return s.get(k)!;
  };
  // Purpose without the one-time first-run paragraph ("You will (1) …").
  const purpose = get('## Purpose').replace(/\nYou will \(1\)[\s\S]*?\n\n/, '\n\n');
  // §3: only the facts (3.3) and facts-only (3.4) parts, applied to added or changed endpoints.
  const s3 = get('## 3.');
  const s33 = s3.slice(s3.indexOf('### 3.3'));
  const facts =
    '## 3. Collect the facts for each endpoint that was added or changed\n\n' +
    '(Apply only to the endpoints that were added or changed — not a whole-project discovery.)\n\n' +
    s33.replace(/^### 3\.3[^\n]*\n/, '');
  const range = (from: string, to: string) => {
    const keys = [...s.keys()];
    const i = keys.findIndex((k) => k.startsWith(from));
    const j = keys.findIndex((k) => k.startsWith(to));
    if (i < 0 || j < 0) throw new Error(`shared-api-docs-prompt.md: sections ${from} … ${to} not found`);
    return keys
      .slice(i, j + 1)
      .map((k) => s.get(k)!)
      .join('\n');
  };
  const chunks = [purpose, range('## 1.', '## 2A.'), facts, range('## 4.', '## 7.'), get('## 10.')].map(
    trimEnd,
  );
  return `${FRONT}${chunks.join('\n\n---\n\n')}\n`;
}

function main() {
  const target = process.env.API_GUIDE_SKILL?.trim() || path.join(os.homedir(), '.config/api-guide/SKILL.md');
  const text = masterSkill(readFileSync(PROMPT, 'utf8'));
  if (process.argv.includes('--stdout')) {
    process.stdout.write(text);
    return;
  }
  if (process.argv.includes('--check')) {
    const same = existsSync(target) && readFileSync(target, 'utf8') === text;
    console.log(same ? `${target} is up to date.` : `${target} differs from docs/shared-api-docs-prompt.md.`);
    if (!same) process.exit(1);
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
  console.log(`Wrote ${target} from docs/shared-api-docs-prompt.md.`);
}

if (require.main === module) main();
