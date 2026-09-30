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
  /** Endpoint key, e.g. "writePii" ('' = all endpoints). */
  endpoint: string;
  q: string;
}

export const EMPTY_FILTERS: Filters = { statuses: [], endpoint: '', q: '' };

/** Hash format: #status=FAIL,BLOCKED&endpoint=writePii&q=…&test=<key> */
export function parseHash(hash: string): { filters: Filters; test: string | null } {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  return {
    test: p.get('test'),
    filters: {
      statuses: (p.get('status') ?? '').split(',').filter(Boolean) as StatusFilter[],
      endpoint: p.get('endpoint') ?? '',
      q: p.get('q') ?? '',
    },
  };
}

export function buildHash(f: Filters, test: string | null): string {
  const p = new URLSearchParams();
  if (f.statuses.length) p.set('status', f.statuses.join(','));
  if (f.endpoint) p.set('endpoint', f.endpoint);
  if (f.q) p.set('q', f.q);
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
