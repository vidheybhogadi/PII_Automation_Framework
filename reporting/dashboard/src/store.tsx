/** App state for the single-page report: data, test-list filters, theme, overlays, toasts, URL state. */
import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { scopeTests } from '../../core/analytics';
import { ENDPOINT_GROUP_ORDER } from '../../core/catalog';
import { endpointOf, plainEndpoint } from './plain';
import type { ReportData, ReportTest, TestStatus } from '../../core/types';
import { buildHash, EMPTY_FILTERS, parseHash, prefersReducedMotion, storage, type Filters } from './utils';

export type ThemeMode = 'light' | 'dark' | 'system';
export const ACCENTS = ['azure', 'violet', 'emerald', 'rose', 'amber', 'cyan'] as const;
export type Accent = (typeof ACCENTS)[number];

/** "Not run" = blocked, fixme, skipped or unknown. */
export const NOT_RUN: TestStatus[] = ['BLOCKED', 'FIXME', 'SKIPPED', 'UNKNOWN'];

const GROUP_RANK = (key: string): number => {
  const i = (ENDPOINT_GROUP_ORDER as readonly string[]).indexOf(key);
  return i < 0 ? ENDPOINT_GROUP_ORDER.length : i;
};
const RANK: Record<TestStatus, number> = { FAIL: 0, BLOCKED: 1, FIXME: 1, UNKNOWN: 2, SKIPPED: 2, PASS: 3 };

export interface Toast {
  id: number;
  text: string;
}

interface UiState {
  palette: boolean;
  shortcuts: boolean;
  guide: boolean;
  methodology: boolean;
  drawer: string | null;
}
const CLOSED: UiState = { palette: false, shortcuts: false, guide: false, methodology: false, drawer: null };

export interface AppState {
  report: ReportData;
  /** Service tests (or everything when the run only has framework self-tests). The report is about these. */
  service: ReportTest[];
  /** Framework self-tests, summarised separately. */
  selfTests: ReportTest[];
  /** Service tests after the test-list filters, grouped by endpoint (failed → waiting → passed inside each). */
  list: ReportTest[];
  byKey: Map<string, ReportTest>;
  filters: Filters;
  setFilters: (f: Filters | ((prev: Filters) => Filters)) => void;
  showTests: (f: Partial<Filters>) => void;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  resolvedTheme: 'light' | 'dark';
  accent: Accent;
  setAccent: (a: Accent) => void;
  ui: UiState;
  setUi: (patch: Partial<UiState>) => void;
  closeTop: () => void;
  openTest: (key: string) => void;
  toast: (text: string) => void;
  toasts: Toast[];
  isPrint: boolean;
  isDemo: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

function matches(t: ReportTest, f: Filters): boolean {
  if (f.statuses.length && !f.statuses.includes(t.status)) return false;
  if (f.endpoint && endpointOf(t) !== f.endpoint) return false;
  if (f.q) {
    const hay =
      `${t.id} ${t.title} ${plainEndpoint(endpointOf(t)).name} ${t.endpoints.join(' ')} ${t.status} ${t.apiCalls.map((c) => c.errorCode ?? '').join(' ')}`.toLowerCase();
    if (
      !f.q
        .toLowerCase()
        .split(/\s+/)
        .every((token) => hay.includes(token))
    )
      return false;
  }
  return true;
}

export function AppProvider({
  report,
  isPrint,
  children,
}: {
  report: ReportData;
  isPrint: boolean;
  children: ComponentChildren;
}) {
  const initial = useMemo(() => parseHash(location.hash), []);
  const [filters, setFilters] = useState<Filters>(isPrint ? EMPTY_FILTERS : initial.filters);
  const [mode, setModeState] = useState<ThemeMode>(() => (storage.get('theme') as ThemeMode) || 'system');
  const [accent, setAccentState] = useState<Accent>(() => (storage.get('accent') as Accent) || 'azure');
  const [ui, setUiState] = useState<UiState>({ ...CLOSED, drawer: isPrint ? null : initial.test });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const resolvedTheme: 'light' | 'dark' = isPrint
    ? 'light'
    : mode === 'system'
      ? systemDark
        ? 'dark'
        : 'light'
      : mode;

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Theme changes cross-fade via the View Transitions API when available.
  const first = useRef(true);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.dataset.theme = resolvedTheme;
      root.dataset.accent = accent;
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (first.current || isPrint || prefersReducedMotion() || !doc.startViewTransition) apply();
    else doc.startViewTransition(apply);
    first.current = false;
  }, [resolvedTheme, accent, isPrint]);

  const service = useMemo(() => scopeTests(report.tests), [report]);
  const selfTests = useMemo(() => {
    const inScope = new Set(service);
    return report.tests.filter((t) => !inScope.has(t));
  }, [report, service]);
  const byKey = useMemo(() => new Map(report.tests.map((t) => [t.key, t])), [report]);
  // Same order everywhere (table, details panel, J/K): by endpoint, then failed → waiting → passed, then ID.
  const list = useMemo(
    () =>
      service
        .filter((t) => matches(t, filters))
        .sort(
          (a, b) =>
            GROUP_RANK(endpointOf(a)) - GROUP_RANK(endpointOf(b)) ||
            RANK[a.status] - RANK[b.status] ||
            a.id.localeCompare(b.id, undefined, { numeric: true }),
        ),
    [service, filters],
  );

  // Shareable URL: #status=FAIL&q=…&endpoint=…&test=<key>
  useEffect(() => {
    if (isPrint) return;
    const h = buildHash(filters, ui.drawer);
    if (h !== location.hash) history.replaceState(null, '', h || location.pathname + location.search);
  }, [filters, ui.drawer, isPrint]);

  const setUi = useCallback((patch: Partial<UiState>) => setUiState((u) => ({ ...u, ...patch })), []);
  const toastId = useRef(0);
  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const value: AppState = {
    report,
    service,
    selfTests,
    list,
    byKey,
    filters,
    setFilters,
    showTests: (f) => {
      setFilters({ ...EMPTY_FILTERS, ...f });
      document
        .getElementById('tests')
        ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    },
    mode,
    setMode: (m) => {
      setModeState(m);
      storage.set('theme', m);
    },
    resolvedTheme,
    accent,
    setAccent: (a) => {
      setAccentState(a);
      storage.set('accent', a);
    },
    ui,
    setUi,
    // Escape closes the top-most overlay only.
    closeTop: () =>
      setUiState((u) =>
        u.palette || u.shortcuts || u.guide || u.methodology ? { ...CLOSED, drawer: u.drawer } : CLOSED,
      ),
    openTest: (key) => setUiState((u) => ({ ...u, drawer: key, palette: false })),
    toast,
    toasts,
    isPrint,
    isDemo: report.meta.dataSource === 'DEMO',
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
