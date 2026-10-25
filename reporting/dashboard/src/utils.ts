/** Browser utilities: downloads, clipboard, URL-hash state, safe storage, formatting. */
import type { TestStatus } from '../../core/types';

export const STORAGE_PREFIX = 'pii-sentinel:';

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(STORAGE_PREFIX + key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch {
      /* storage unavailable (private mode / file policies) — preference simply won't persist */
    }
  },
};

export function download(filename: string, content: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for file:// or denied permissions.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * A status filter token (URL: #status=…). One per reader-facing outcome: PASS, FAIL, FINDING (security finding),
 * BLOCKED, SKIPPED, NOT_TESTED, NOT_APPLICABLE. FIXME / UNKNOWN are accepted from older links (→ Blocked / Not Tested).
 */
export type StatusFilter = TestStatus | 'FINDING' | 'NOT_TESTED' | 'NOT_APPLICABLE';

/** Test-list filters. */
export interface Filters {
  statuses: StatusFilter[];
  /** Endpoint key, e.g. "writePii" or a Milestone 2 API ID "API-001" ('' = all endpoints). */
  endpoint: string;
  /** Milestone 2 API area, e.g. "G3" ('' = all areas). */
  area: string;
  /** The "Show" value for the current Group by dimension, e.g. "Positive" for Type ('' = All). */
  show: string;
  q: string;
}

export const EMPTY_FILTERS: Filters = { statuses: [], endpoint: '', area: '', show: '', q: '' };

/** True when any test-list filter is set (status, endpoint, area, Show value or search). */
export const hasFilters = (f: Filters): boolean =>
  Boolean(f.statuses.length || f.endpoint || f.area || f.show || f.q);

/**
 * The endpoint explorer in the side panel ("How each endpoint did"): an API area (level 1), one endpoint (level 2)
 * and — with `test` in the hash — one of its tests (level 3). `area` is null for Milestone 1 (no areas).
 */
export interface Panel {
  area: string | null;
  endpoint: string | null;
}

/**
 * Hash format: #by=type&show=Positive&area=G3&endpoint=API-011&status=FAIL,BLOCKED&q=…
 *   &panelArea=G3&panelEndpoint=API-011&test=<key>
 */
export function parseHash(hash: string): {
  filters: Filters;
  test: string | null;
  by: string | null;
  panel: Panel | null;
} {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const panelArea = p.get('panelArea');
  const panelEndpoint = p.get('panelEndpoint');
  return {
    test: p.get('test'),
    by: p.get('by'),
    panel: panelArea || panelEndpoint ? { area: panelArea || null, endpoint: panelEndpoint || null } : null,
    filters: {
      statuses: (p.get('status') ?? '').split(',').filter(Boolean) as StatusFilter[],
      endpoint: p.get('endpoint') ?? '',
      area: p.get('area') ?? '',
      show: p.get('show') ?? '',
      q: p.get('q') ?? '',
    },
  };
}

/** `by` (the Group by choice) is written whenever it is not the default or a filter is set, so links restore exactly. */
export function buildHash(
  f: Filters,
  test: string | null,
  by = 'endpoint',
  panel: Panel | null = null,
): string {
  const p = new URLSearchParams();
  if (by !== 'endpoint' || hasFilters(f)) p.set('by', by);
  if (f.show) p.set('show', f.show);
  if (f.area) p.set('area', f.area);
  if (f.statuses.length) p.set('status', f.statuses.join(','));
  if (f.endpoint) p.set('endpoint', f.endpoint);
  if (f.q) p.set('q', f.q);
  if (panel?.area) p.set('panelArea', panel.area);
  if (panel?.endpoint) p.set('panelEndpoint', panel.endpoint);
  if (test) p.set('test', test);
  const q = p.toString();
  return q ? `#${q}` : '';
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const plural = (n: number, word: string, pluralWord = `${word}s`): string =>
  `${n} ${n === 1 ? word : pluralWord}`;
