/**
 * The API change log (m2/docs/api-changes.json) and the documented state of an endpoint after it.
 *
 * The change log is append-only: `npm run docs:api:drift -- --apply` adds evidence-backed changes found by the drift
 * check (source "code" or "staging"); Dev's written answers can be added by hand with source "dev". Re-applying the
 * same finding never adds a second entry. The export (scripts/api-docs/export.ts) merges it into the docs:
 *   - added / changed params and response fields are shown with their source label
 *   - removed params / fields stay visible, struck through with "Removed on <date>", for 90 days — then they leave the
 *     endpoint body (the history keeps them)
 *   - a removed endpoint is kept, flagged removed, and left out of the counts
 * Unknown types stay "not stated". Nothing is applied from items the drift check marks "needs review".
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const CHANGES_FILE = 'm2/docs/api-changes.json';
/** Removed params / fields stay in the endpoint body (struck through) this many days. */
export const STRIKE_DAYS = 90;

export type ChangeKind =
  | 'param-added'
  | 'param-removed'
  | 'param-changed'
  | 'field-added'
  | 'field-removed'
  | 'field-changed'
  | 'endpoint-added'
  | 'endpoint-removed'
  | 'endpoint-restored';
export type ChangeSource = 'code' | 'staging' | 'dev';

export interface Attrs {
  required?: boolean;
  type?: string;
}

export interface ApiChange {
  /** YYYY-MM-DD: when the change was seen (code check date, staging run date or Dev's answer). */
  date: string;
  apiId: string;
  kind: ChangeKind;
  /** Param or field name (dotted for nested); '' for endpoint changes. */
  name: string;
  before: Attrs | null;
  after: Attrs | null;
  source: ChangeSource;
  /** file:line @sha for code, run id + date for staging, who/when for Dev. Internal: only code refs are published. */
  evidence: string;
}

export interface Verified {
  code?: { date: string; ref: string };
  staging?: { date: string };
}

export interface ChangeLog {
  about: string;
  changes: ApiChange[];
  /** Per endpoint: when the drift check last confirmed it against code / staging. */
  verified: Record<string, Verified>;
}

export const ABOUT =
  'Append-only API change log. Written by `npm run docs:api:drift -- --apply` (evidence-backed changes from the Aisle code and staging recordings) and by hand for Dev answers (source "dev"). Merged into the API docs by `npm run docs:api`.';

/** API_CHANGES_FILE overrides the log location (a scratch copy for a test pass of the site). */
export function loadChanges(root: string): ChangeLog {
  const file = process.env.API_CHANGES_FILE?.trim() || path.join(root, CHANGES_FILE);
  if (!existsSync(file)) return { about: ABOUT, changes: [], verified: {} };
  const d = JSON.parse(readFileSync(file, 'utf8')) as Partial<ChangeLog>;
  return { about: d.about ?? ABOUT, changes: d.changes ?? [], verified: d.verified ?? {} };
}

const scopeOf = (c: Pick<ApiChange, 'apiId' | 'kind' | 'name'>) =>
  `${c.apiId} ${c.kind.split('-')[0]} ${c.name}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Append changes, skipping any whose scope (endpoint + param/field/endpoint + name) already ends with the same kind
 * and the same "after" — so re-running the apply never duplicates. Returns the entries actually added.
 */
export function appendChanges(log: ChangeLog, add: ApiChange[]): ApiChange[] {
  const added: ApiChange[] = [];
  for (const c of add) {
    const last = [...log.changes].reverse().find((x) => scopeOf(x) === scopeOf(c));
    if (last && last.kind === c.kind && same(last.after, c.after)) continue;
    log.changes.push(c);
    added.push(c);
  }
  return added;
}

/** Days from a to b (YYYY-MM-DD). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export type DocSource = 'doc' | ChangeSource;

export interface DocItem extends Attrs {
  name: string;
  source: DocSource;
  /** Date the item was added or last changed by a recorded change. */
  since?: string;
  removedOn?: string;
  /** Published evidence (code file:line @sha only). */
  ref?: string;
}

export interface HistoryItem {
  date: string;
  kind: ChangeKind;
  name: string;
  before: Attrs | null;
  after: Attrs | null;
  source: ChangeSource;
  label: string;
  ref?: string;
}

export interface DocState {
  params: DocItem[];
  responseFields: DocItem[];
  removed?: { on: string; source: ChangeSource; label: string; ref?: string };
  history: HistoryItem[];
  lastVerified?: { date: string; source: 'code' | 'staging'; label: string };
}

/** The label shown next to an item that came from a recorded change. */
export function sourceLabel(source: DocSource, date?: string): string {
  if (source === 'code') return 'from code — confirm with Dev';
  if (source === 'staging') return `seen on staging${date ? ` ${date}` : ''}`;
  if (source === 'dev') return 'confirmed by Dev';
  return '';
}

/** Only code evidence (file:line @sha) is published; staging evidence names test runs and stays internal. */
const publishedRef = (c: ApiChange) => (c.source === 'code' ? c.evidence.split('; ')[0] : undefined);

/**
 * The documented state of one endpoint: its baseline request keys (Dev's document) with every recorded change applied
 * in date order, removed items dropped after STRIKE_DAYS (they stay in `history`).
 */
export function docState(
  apiId: string,
  baselineKeys: string[],
  log: ChangeLog,
  today: string,
  /** Baseline items with their own source (code-discovered routes: params / keys read from the code). */
  base: { params?: DocItem[]; fields?: DocItem[] } = {},
): DocState {
  const params: DocItem[] = [
    ...baselineKeys.map((name) => ({ name, source: 'doc' as const })),
    ...(base.params ?? []),
  ];
  const fields: DocItem[] = [...(base.fields ?? [])];
  let removed: DocState['removed'];
  const history: HistoryItem[] = [];
  const mine = log.changes
    .map((c, i) => [c, i] as const)
    .filter(([c]) => c.apiId === apiId)
    .sort(([a, i], [b, j]) => (a.date < b.date ? -1 : a.date > b.date ? 1 : i - j))
    .map(([c]) => c);
  for (const c of mine) {
    const ref = publishedRef(c);
    history.push({
      date: c.date,
      kind: c.kind,
      name: c.name,
      before: c.before,
      after: c.after,
      source: c.source,
      label: sourceLabel(c.source, c.date),
      ...(ref ? { ref } : {}),
    });
    if (c.kind === 'endpoint-removed') {
      removed = {
        on: c.date,
        source: c.source,
        label: sourceLabel(c.source, c.date),
        ...(ref ? { ref } : {}),
      };
      continue;
    }
    if (c.kind === 'endpoint-added') continue;
    if (c.kind === 'endpoint-restored') {
      removed = undefined;
      continue;
    }
    const list = c.kind.startsWith('param') ? params : fields;
    let item = list.find((x) => x.name === c.name);
    const verb = c.kind.split('-')[1];
    if (verb === 'removed') {
      if (item) item.removedOn = c.date;
      else list.push({ name: c.name, source: c.source, removedOn: c.date, ...(ref ? { ref } : {}) });
      continue;
    }
    if (!item) {
      item = { name: c.name, source: c.source };
      list.push(item);
    }
    delete item.removedOn;
    item.source = c.source;
    item.since = c.date;
    if (ref) item.ref = ref;
    else delete item.ref;
    if (c.after?.required !== undefined) item.required = c.after.required;
    if (c.after?.type !== undefined) item.type = c.after.type;
  }
  const keep = (x: DocItem) => !x.removedOn || daysBetween(x.removedOn, today) <= STRIKE_DAYS;
  const v = log.verified[apiId];
  let lastVerified: DocState['lastVerified'];
  if (v?.code || v?.staging) {
    const useStaging = !!v.staging && (!v.code || v.staging.date >= v.code.date);
    lastVerified = useStaging
      ? { date: v.staging!.date, source: 'staging', label: 'staging' }
      : { date: v.code!.date, source: 'code', label: `code @ ${v.code!.ref}` };
  }
  return {
    params: params.filter(keep),
    responseFields: fields.filter(keep),
    ...(removed ? { removed } : {}),
    history,
    ...(lastVerified ? { lastVerified } : {}),
  };
}

/** Active (not removed) names. */
export const activeNames = (items: DocItem[]) => items.filter((x) => !x.removedOn).map((x) => x.name);
