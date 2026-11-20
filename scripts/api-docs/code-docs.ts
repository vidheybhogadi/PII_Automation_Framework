/**
 * Code-documented Aisle routes: full API documentation written from the Aisle code (origin/develop_new) for routes no
 * Dev API document lists — purpose, auth, request and response fields, flow, data stores and notes, each labelled
 * "from code — confirm with Dev" with file:line references.
 *
 *   m2/docs/code-documented-routes.json   { about, ref, sha, documented, routes: [entry, …] }
 *
 * Every entry already has the published api-data.json shape (slug, id, method, path, group, name, fields, auth, …).
 * An entry whose id matches a thin code-discovered route (CODE-001 … from code-routes.ts) replaces it; the others are
 * added. Security observations made while documenting are never stored here (they are kept privately for Dev).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const CODE_DOCS_JSON = 'm2/docs/code-documented-routes.json';

/**
 * Full entries owned by other suites (same shape; each sets its own `origin`, e.g. 'dev' for a Dev document). Merged
 * like the code-documented routes, after them.
 */
export const SUITE_DOCS_JSON = ['m2-pii-firstname/docs/api-docs-routes.json'];

export interface CodeDocItem {
  name: string;
  source: 'code' | 'dev' | 'staging';
  label?: string;
  since: string;
  required?: boolean;
  type?: string;
  ref?: string;
}

export interface CodeDoc {
  slug: string;
  id: string;
  method: string;
  path: string;
  group: string;
  name: string;
  fields: string[];
  auth: string;
  caller: string;
  operation: string;
  source: string;
  summary: string[];
  headers: [string, string, string][];
  keys: string[];
  params: CodeDocItem[];
  responseFields?: CodeDocItem[];
  curl: string[];
  flows: { fields: string[]; label: string; steps: { fn: string; explain: string; pii: boolean }[] }[];
  stores: { store: string; object: string; access: string; what: string }[];
  notes: { title: string; text: string; warn?: boolean }[];
  related: string[];
  search: string;
  lastVerified: { date: string; source: 'code' | 'dev' | 'staging'; label: string };
  history: Record<string, unknown>[];
  /** Where the entry's facts come from; code-documented routes leave it out ('code'). */
  origin?: 'code' | 'dev';
}

export interface CodeDocsFile {
  about: string;
  ref: string;
  sha: string;
  documented: string;
  routes: CodeDoc[];
}

export function loadCodeDocs(root: string): CodeDocsFile | null {
  const file = path.join(root, CODE_DOCS_JSON);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as CodeDocsFile) : null;
}

/** Entries from SUITE_DOCS_JSON that exist on disk. */
export function loadSuiteDocs(root: string): CodeDoc[] {
  return SUITE_DOCS_JSON.flatMap((rel) => {
    const file = path.join(root, rel);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { routes: CodeDoc[] }).routes : [];
  });
}

/** Groups used only by code-documented routes (no QA group in the M2 inventory). */
export const DOC_ONLY_GROUPS: Record<string, { name: string; blurb: string }> = {
  G11: {
    name: 'App config & integrations',
    blurb:
      'Reference lists, app releases, popups, tracking and analytics events, geo lookups and site pages.',
  },
  G12: {
    name: 'Internal dashboard',
    blurb:
      'Pages of the internal ActiveAdmin dashboard (`/bangalore745`): reports and operations tools for staff.',
  },
};
