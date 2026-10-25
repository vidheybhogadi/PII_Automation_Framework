/** App state for the single-page report: data, test-list filters, theme, overlays, toasts, URL state. */
import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { catalogTests, OUTCOMES, scopeTests, testOutcome, type Outcome } from '../../core/analytics';
import { CROSS_ENDPOINT, ENDPOINT_GROUP_ORDER, suiteOf } from '../../core/catalog';
import { TEST_TYPES, testTypeOf } from '../../core/test-case';
import { endpointOf, plainEndpoint } from './plain';
import type { ApiArea, EndpointInfo, ReportData, ReportTest } from '../../core/types';
import {
  buildHash,
  EMPTY_FILTERS,
  hasFilters,
  parseHash,
  prefersReducedMotion,
  storage,
  type Filters,
  type StatusFilter,
} from './utils';

export type ThemeMode = 'light' | 'dark' | 'system';
export const ACCENTS = ['azure', 'violet', 'emerald', 'rose', 'amber', 'cyan'] as const;
export type Accent = (typeof ACCENTS)[number];

/** The status-filter token for each outcome (one filter per outcome; see OUTCOMES for the order). */
export const OUTCOME_FILTER: Record<Outcome, StatusFilter> = {
  Fail: 'FAIL',
  'Security finding': 'FINDING',
  Blocked: 'BLOCKED',
  Skipped: 'SKIPPED',
  'Not Tested': 'NOT_TESTED',
  'Not Applicable': 'NOT_APPLICABLE',
  Pass: 'PASS',
};
/** Tokens from older links that still mean an outcome. */
const LEGACY_FILTER: Partial<Record<StatusFilter, Outcome>> = { FIXME: 'Blocked', UNKNOWN: 'Not Tested' };

/** Filter value meaning "Not Tested" (not part of this run, run stopped, or the facade was unreachable). */
export const NOT_RUN: StatusFilter[] = ['NOT_TESTED'];

/** The reader-facing status of a test: Pass, Fail, Security finding, Blocked, Skipped, Not Tested or Not Applicable. */
export const outcomeOf = (t: ReportTest): Outcome => testOutcome(t).outcome;

/** True when a test with outcome `o` is selected by the status filter tokens (empty = everything). */
export function outcomeMatches(o: Outcome, statuses: readonly StatusFilter[]): boolean {
  if (!statuses.length) return true;
  return statuses.some((s) => s === OUTCOME_FILTER[o] || LEGACY_FILTER[s] === o);
}

/** Known M1 endpoints in the guide's order, then other endpoints (M2 APIs), then "Across endpoints". */
const GROUP_RANK = (key: string): number => {
  if (key === CROSS_ENDPOINT) return ENDPOINT_GROUP_ORDER.length + 1;
  const i = (ENDPOINT_GROUP_ORDER as readonly string[]).indexOf(key);
  return i < 0 ? ENDPOINT_GROUP_ORDER.length : i;
};
const RANK = Object.fromEntries(OUTCOMES.map((o, i) => [o, i])) as Record<Outcome, number>;

/**
 * How the test list is grouped: by endpoint (default), test type, category (Milestone 2 workbook categories — the
 * option is shown only when some test has one), suite (Smoke/Regression), or not at all.
 */
export type GroupBy = 'endpoint' | 'type' | 'category' | 'suite' | 'none';
export const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'endpoint', label: 'Endpoint' },
  { value: 'type', label: 'Type' },
  { value: 'category', label: 'Category' },
  { value: 'suite', label: 'Suite' },
  { value: 'none', label: 'None' },
];
export const NOT_CATEGORISED = 'Not categorised';
export const categoryOf = (t: ReportTest): string => t.info?.category ?? NOT_CATEGORISED;
export const TYPE_ORDER = TEST_TYPES;
export const SUITE_ORDER = ['Smoke', 'Regression'] as const;
/** The test type: its description's type, else its @positive / @negative / … tag (M2 per-API tests), else none. */
export const typeOf = (t: ReportTest): string => testTypeOf(t) || NOT_CATEGORISED;
const typeRank = (t: ReportTest): number => {
  const i = (TYPE_ORDER as readonly string[]).indexOf(typeOf(t));
  return i < 0 ? TYPE_ORDER.length : i;
};

/** The heading a test is listed under for the chosen grouping ('' = no heading). */
export function groupKeyOf(t: ReportTest, groupBy: GroupBy): string {
  if (groupBy === 'endpoint') return endpointOf(t);
  if (groupBy === 'type') return typeOf(t);
  if (groupBy === 'category') return categoryOf(t);
  if (groupBy === 'suite') return suiteOf(t.tags);
  return '';
}

/** Group-by dimensions whose "Show" picker is a plain list of values (Endpoint has its own area/endpoint picker). */
export const VALUE_DIMENSIONS: readonly GroupBy[] = ['type', 'suite', 'category'];

/** Which filters to leave out — used to count the options of a picker without the picker's own choice. */
export interface Ignore {
  statuses?: boolean;
  show?: boolean;
  endpoint?: boolean;
  area?: boolean;
}

/** True when a test passes the test-list filters (status, area, endpoint, Show value for `groupBy`, search). */
export function matches(t: ReportTest, f: Filters, groupBy: GroupBy, ignore: Ignore = {}): boolean {
  if (!ignore.statuses && !outcomeMatches(outcomeOf(t), f.statuses)) return false;
  if (!ignore.area && f.area && t.apiArea !== f.area) return false;
  if (!ignore.endpoint && f.endpoint && endpointOf(t) !== f.endpoint) return false;
  if (!ignore.show && f.show && VALUE_DIMENSIONS.includes(groupBy) && groupKeyOf(t, groupBy) !== f.show)
    return false;
  if (f.q) {
    const ep = t.api ? '' : plainEndpoint(endpointOf(t)).name;
    const hay =
      `${t.id} ${t.title} ${t.info?.what ?? ''} ${ep} ${t.api ?? ''} ${t.endpoints.join(' ')} ${outcomeOf(t)} ${t.apiCalls.map((c) => c.errorCode ?? '').join(' ')}`.toLowerCase();
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

/** Pass / fail (incl. security findings) / blocked tallies shown beside every picker option. */
export interface Tally {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
}
export function tally(tests: readonly ReportTest[]): Tally {
  const out: Tally = { total: tests.length, pass: 0, fail: 0, blocked: 0 };
  for (const t of tests) {
    const o = outcomeOf(t);
    if (o === 'Pass') out.pass += 1;
    else if (o === 'Fail' || o === 'Security finding') out.fail += 1;
    else if (o === 'Blocked') out.blocked += 1;
  }
  return out;
}
/** "(412) · 380 ✓ · 20 ✗ · 12 ⛔" — blocked only when there are some. */
export const tallyText = (c: Tally): string =>
  `(${c.total}) · ${c.pass} ✓ · ${c.fail} ✗${c.blocked ? ` · ${c.blocked} ⛔` : ''}`;

const byId = (a: ReportTest, b: ReportTest) =>
  a.id.localeCompare(b.id, undefined, { numeric: true }) || a.title.localeCompare(b.title);

/** One order for the table, the details panel and J/K: grouped headings first, then by outcome (OUTCOMES order: Fail first, Pass last), then ID. */
function compareFor(groupBy: GroupBy, areaRank: (t: ReportTest) => number) {
  return (a: ReportTest, b: ReportTest): number => {
    if (groupBy === 'none') return byId(a, b);
    const group =
      groupBy === 'endpoint'
        ? areaRank(a) - areaRank(b) ||
          GROUP_RANK(endpointOf(a)) - GROUP_RANK(endpointOf(b)) ||
          endpointOf(a).localeCompare(endpointOf(b), undefined, { numeric: true })
        : groupBy === 'type'
          ? typeRank(a) - typeRank(b)
          : groupBy === 'category'
            ? typeRank(a) - typeRank(b) || categoryOf(a).localeCompare(categoryOf(b))
            : Number(suiteOf(a.tags) === 'Regression') - Number(suiteOf(b.tags) === 'Regression');
    return group || RANK[outcomeOf(a)] - RANK[outcomeOf(b)] || byId(a, b);
  };
}

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
  /** Every service test in the suite, including ones not part of this run (Not Tested). */
  all: ReportTest[];
  groupBy: GroupBy;
  /** Changing the dimension clears its Show value (the values belong to the dimension). */
  setGroupBy: (g: GroupBy) => void;
  /** Milestone 2 API areas (G1–G10) with their endpoints; empty for Milestone 1. */
  areas: ApiArea[];
  /** Every endpoint the report knows: the M1 inventory plus the M2 area endpoints. */
  endpointList: EndpointInfo[];
  /** True when any test-list filter is set. */
  filtered: boolean;
  clearFilters: () => void;
  /** All service tests after the test-list filters, grouped by endpoint (OUTCOMES order inside each). */
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

  // `service`: tests that ran (health, verdict, history). `all`: every service test, including Not Tested ones.
  const service = useMemo(() => scopeTests(report.tests), [report]);
  const all = useMemo(() => catalogTests(report.tests), [report]);
  const selfTests = useMemo(() => {
    const inScope = new Set([...service, ...all]);
    return report.tests.filter((t) => !t.notRun && !inScope.has(t));
  }, [report, service, all]);
  const byKey = useMemo(() => new Map(report.tests.map((t) => [t.key, t])), [report]);
  // Group by: a shared link (#by=…) wins over the reader's remembered choice; print always uses endpoints.
  const [groupBy, setGroupByState] = useState<GroupBy>(() => {
    const valid = (g: string | null): g is GroupBy => GROUP_BY_OPTIONS.some((o) => o.value === g);
    if (isPrint) return 'endpoint';
    if (valid(initial.by)) return initial.by;
    // An area / endpoint link without `by` belongs to the endpoint pickers.
    if (initial.filters.area || initial.filters.endpoint) return 'endpoint';
    const saved = storage.get('groupBy');
    return valid(saved) ? saved : 'endpoint';
  });
  const setGroupBy = (g: GroupBy) => {
    setGroupByState(g);
    storage.set('groupBy', g);
    setFilters((f) => (f.show ? { ...f, show: '' } : f));
  };
  const areas = useMemo(() => report.apiAreas ?? [], [report]);
  const endpointList = useMemo(
    () => [...report.endpoints, ...areas.flatMap((a) => a.endpoints)],
    [report, areas],
  );
  const list = useMemo(() => {
    const rank = new Map(areas.map((a, i) => [a.key, i]));
    const areaRank = (t: ReportTest) => (t.apiArea ? (rank.get(t.apiArea) ?? areas.length) : -1);
    return all.filter((t) => matches(t, filters, groupBy)).sort(compareFor(groupBy, areaRank));
  }, [all, filters, groupBy, areas]);

  // Shareable URL: #by=type&show=Positive&area=…&endpoint=…&status=FAIL&q=…&test=<key>
  useEffect(() => {
    if (isPrint) return;
    const h = buildHash(filters, ui.drawer, groupBy);
    if (h !== location.hash) history.replaceState(null, '', h || location.pathname + location.search);
  }, [filters, ui.drawer, groupBy, isPrint]);

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
    all,
    groupBy,
    setGroupBy,
    areas,
    endpointList,
    filtered: hasFilters(filters),
    clearFilters: () => setFilters(EMPTY_FILTERS),
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
