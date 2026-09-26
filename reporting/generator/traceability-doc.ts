/**
 * Generates docs/requirements-traceability.md from the catalog (reporting/core/catalog.ts) — the single
 * source of truth for requirement → endpoint → test mapping. The dashboard's Requirements view uses the same
 * catalog, so the document and the report can never disagree.
 *
 *   npm run docs:traceability          # regenerate
 *   (reporting unit test RPT-SF-010 fails if the committed doc is stale)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REQUIREMENTS } from '../core/catalog';
import { endpointInventory } from './build-report-data';

export const TRACEABILITY_DOC = path.resolve(__dirname, '../../docs/requirements-traceability.md');

export function renderTraceabilityDoc(): string {
  const eps = new Map(endpointInventory().map((e) => [e.key, `${e.method} ${e.path}`]));
  const groups = [...new Set(REQUIREMENTS.map((r) => r.group))];
  const lines: string[] = [
    '# Requirements Traceability Matrix',
    '',
    '<!-- GENERATED FILE — do not edit by hand. Source: reporting/core/catalog.ts · Regenerate: npm run docs:traceability -->',
    '',
    'Each requirement comes from the **PII Service API Integration Guide** (section in the Source column).',
    '**Type:** Documented = stated in the guide · Derived = follows directly from the guide · Policy = security',
    'expectation not in the guide (see `known-gaps-and-questions.md` §3).',
    '',
    'This document shows **design** traceability (which tests verify which requirement). **Execution status** per',
    'requirement — VERIFIED / FAILED / PARTIAL / BLOCKED / NOT EXECUTED — comes from real runs and is shown in the',
    'PII Sentinel dashboard (Requirements section) and its PDF. Test references ending in `*` cover every test with',
    'that ID prefix.',
    '',
    `**${REQUIREMENTS.length} requirements** in ${groups.length} groups · ${REQUIREMENTS.filter((r) => r.openQuestion).length} depend on an open backend question.`,
    '',
  ];
  for (const g of groups) {
    lines.push(
      `## ${g}`,
      '',
      '| Req | Requirement | Type | Source | Endpoints | Tests | Open question |',
      '|---|---|---|---|---|---|---|',
    );
    for (const r of REQUIREMENTS.filter((x) => x.group === g)) {
      const endpoints = r.endpoints.length
        ? r.endpoints.map((k) => `\`${eps.get(k) ?? k}\``).join('<br>')
        : '—';
      const tests = r.tests.map((t) => `\`${t}\``).join(', ');
      lines.push(
        `| ${r.id} | ${r.title} | ${r.type} | ${r.source} | ${endpoints} | ${tests} | ${r.openQuestion ?? '—'} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

if (require.main === module) {
  const next = renderTraceabilityDoc();
  const prev = (() => {
    try {
      return readFileSync(TRACEABILITY_DOC, 'utf8');
    } catch {
      return '';
    }
  })();
  writeFileSync(TRACEABILITY_DOC, next);
  console.log(
    `  ${path.relative(process.cwd(), TRACEABILITY_DOC)} ${prev === next ? 'already up to date' : 'regenerated'}`,
  );
}
