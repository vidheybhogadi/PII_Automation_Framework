/**
 * "All tests" — every test in the suite, grouped by endpoint (or type / category / suite), with a one-line filter
 * bar (Group by · Show · Status · Area · Endpoint · search · Export CSV) and removable chips for the active filters.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatDuration, testOutcome, type Outcome } from '../../../core/analytics';
import { suiteOf } from '../../../core/catalog';
import { testsToCsv } from '../../../core/exporters';
import type { ReportTest } from '../../../core/types';
import { EndpointCombobox, FilterSelect, type EndpointOption, type ValueOption } from '../components/Pickers';
import { EmptyState, OUTCOME_META, OutcomeBadge, Section } from '../components/ui';
import { Icon } from '../icons';
import { byEndpoint, plainEndpoint, plainTitle } from '../plain';
import {
  categoryOf,
  GROUP_BY_OPTIONS,
  groupKeyOf,
  matches,
  OUTCOME_FILTER,
  outcomeMatches,
  outcomeOf,
  SUITE_ORDER,
  TYPE_ORDER,
  typeOf,
  useApp,
  VALUE_DIMENSIONS,
  type GroupBy,
} from '../store';
import { download, isTypingTarget, type Filters, type StatusFilter } from '../utils';

const PAGE = 20;
/** Outcomes of tests that really ran (they have a meaningful duration). */
const RAN: readonly Outcome[] = ['Pass', 'Fail', 'Security finding'];

const TYPE_HEAD: Record<string, { icon: string; note: string }> = {
  Positive: { icon: 'check', note: 'Normal use works as expected' },
  Negative: { icon: 'x', note: 'Wrong or incomplete input is refused' },
  Security: { icon: 'shield', note: 'Token checks, access, customer separation and leaks' },
  Database: { icon: 'database', note: 'Checks the stored data directly' },
  Contract: { icon: 'requirement', note: 'Replies match the documented format' },
};
const SUITE_HEAD: Record<string, { icon: string; note: string }> = {
  Smoke: { icon: 'zap', note: 'Quick, most important checks (tag @smoke)' },
  Regression: { icon: 'layers', note: 'The full check of every behaviour' },
};

/** Heading for a group in the chosen mode; null in "None" mode (a plain list). */
function groupHeading(
  key: string,
  groupBy: GroupBy,
  endpoints: Parameters<typeof plainEndpoint>[1],
): { name: string; icon: string; method?: string; path?: string; note?: string } | null {
  if (groupBy === 'none') return null;
  if (groupBy === 'endpoint') {
    const ep = plainEndpoint(key, endpoints);
    return { name: ep.name, icon: ep.icon, method: ep.method, path: ep.path };
  }
  const meta = (groupBy === 'type' ? TYPE_HEAD : groupBy === 'suite' ? SUITE_HEAD : {})[key] ?? {
    icon: 'box',
    note: '',
  };
  return { name: key, icon: meta.icon, note: meta.note };
}

const groupTests = (tests: readonly ReportTest[], key: (t: ReportTest) => string) => {
  const m = new Map<string, ReportTest[]>();
  for (const t of tests) {
    const k = key(t);
    const l = m.get(k);
    if (l) l.push(t);
    else m.set(k, [t]);
  }
  return m;
};

/** The Status dropdown, in reading order. Not applicable is listed only when some test has it. */
const STATUS_ORDER: readonly Outcome[] = [
  'Pass',
  'Fail',
  'Security finding',
  'Blocked',
  'Skipped',
  'Not Tested',
  'Not Applicable',
];
const STATUS_LABEL: Record<Outcome, string> = {
  Pass: 'Pass',
  Fail: 'Fail',
  'Security finding': 'Security finding',
  Blocked: 'Blocked',
  Skipped: 'Skipped',
  'Not Tested': 'Not tested',
  'Not Applicable': 'Not applicable',
};
const OUTCOME_OF_TOKEN = Object.fromEntries(
  Object.entries(OUTCOME_FILTER).map(([o, token]) => [token, o]),
) as Record<string, Outcome>;
/** "Fail", or "Fail + Blocked" for an older multi-status link. */
const statusLabel = (statuses: readonly StatusFilter[]): string =>
  statuses
    .map((s) => {
      const o = OUTCOME_OF_TOKEN[s] ?? (s === 'FIXME' ? 'Blocked' : s === 'UNKNOWN' ? 'Not Tested' : null);
      return o ? STATUS_LABEL[o] : s;
    })
    .join(' + ');
const DIMENSION_LABEL: Record<GroupBy, string> = {
  endpoint: 'Endpoint',
  type: 'Type',
  category: 'Category',
  suite: 'Suite',
  none: 'None',
};

interface Chip {
  key: string;
  label: string;
  value: string;
  remove: (f: Filters) => Filters;
}

/**
 * Row 1: Group by · Show (Type / Suite / Category values) · Status · Area (Milestone 2) · Endpoint (Group by =
 * Endpoint) · search · Export CSV. Row 2 (only while a filter is set): one removable chip per filter, "Showing X of
 * Y" and Clear all. Every count respects the other filters, never the picker's own choice.
 */
function FilterBar({ searchRef }: { searchRef: preact.RefObject<HTMLInputElement> }) {
  const {
    all,
    list,
    filters,
    setFilters,
    groupBy,
    setGroupBy,
    areas,
    endpointList,
    clearFilters,
    report,
    toast,
  } = useApp();
  const valueDim = VALUE_DIMENSIONS.includes(groupBy);

  const groupOptions: ValueOption[] = GROUP_BY_OPTIONS.filter(
    (o) => o.value !== 'category' || all.some((t) => t.info?.category),
  ).map((o) => ({ value: o.value, label: o.label }));

  const showOptions = useMemo((): ValueOption[] | null => {
    if (!valueDim) return null;
    const base = all.filter((t) => matches(t, filters, groupBy, { show: true }));
    const by = groupTests(base, (t) => groupKeyOf(t, groupBy));
    const present = [...new Set(all.map((t) => groupKeyOf(t, groupBy)))];
    let keys: string[];
    if (groupBy === 'type')
      keys = [...TYPE_ORDER, ...present.filter((k) => !TYPE_ORDER.includes(k as never))];
    else if (groupBy === 'suite') keys = [...SUITE_ORDER];
    else {
      // Categories present in the suite, in Type order (like the M2 workbook), then by name.
      const rank = new Map<string, number>();
      for (const t of all)
        if (!rank.has(categoryOf(t))) rank.set(categoryOf(t), TYPE_ORDER.indexOf(typeOf(t) as never));
      keys = present.sort((a, b) => (rank.get(a) ?? 9) - (rank.get(b) ?? 9) || a.localeCompare(b));
    }
    if (filters.show && !keys.includes(filters.show)) keys.push(filters.show); // e.g. from an old shared link
    return [
      { value: '', label: 'All', count: base.length },
      ...keys.map((k) => ({ value: k, label: k, count: by.get(k)?.length ?? 0 })),
    ];
  }, [all, filters, groupBy, valueDim]);

  const statusOptions = useMemo((): ValueOption[] => {
    const base = all.filter((t) => matches(t, filters, groupBy, { statuses: true }));
    const n = (o: Outcome) => base.filter((t) => outcomeOf(t) === o).length;
    const naInSuite = all.some((t) => outcomeOf(t) === 'Not Applicable');
    const opts: ValueOption[] = [
      { value: '', label: 'All', count: base.length },
      ...STATUS_ORDER.filter(
        (o) => o !== 'Not Applicable' || naInSuite || filters.statuses.includes(OUTCOME_FILTER[o]),
      ).map((o) => ({ value: OUTCOME_FILTER[o], label: STATUS_LABEL[o], count: n(o) })),
    ];
    const current = filters.statuses.join(',');
    if (current && !opts.some((o) => o.value === current))
      opts.push({
        value: current,
        label: statusLabel(filters.statuses),
        count: base.filter((t) => outcomeMatches(outcomeOf(t), filters.statuses)).length,
      });
    return opts;
  }, [all, filters, groupBy]);

  const areaOfEndpoint = (key: string) =>
    areas.find((a) => a.endpoints.some((e) => e.key === key))?.key ?? '';
  const areaOptions = useMemo((): ValueOption[] => {
    if (!areas.length) return [];
    const base = all.filter((t) => matches(t, filters, groupBy, { area: true, endpoint: true }));
    const by = groupTests(base, (t) => t.apiArea ?? '');
    return [
      { value: '', label: 'All areas', count: base.length },
      ...areas.map((a) => ({ value: a.key, label: `${a.key} ${a.name}`, count: by.get(a.key)?.length ?? 0 })),
    ];
  }, [all, filters, groupBy, areas]);

  const endpointPicker = useMemo(() => {
    if (groupBy !== 'endpoint') return null;
    const base = all.filter((t) => matches(t, filters, groupBy, { endpoint: true }));
    const by = groupTests(base, (t) => groupKeyOf(t, 'endpoint'));
    const inArea = all.filter((t) => !filters.area || t.apiArea === filters.area);
    const options: EndpointOption[] = byEndpoint(inArea).map(({ endpoint }) => {
      const p = plainEndpoint(endpoint, endpointList);
      return {
        key: endpoint,
        method: p.method,
        path: p.path,
        name: endpoint === p.name || !p.path.startsWith('/') ? p.name : `${p.name} · ${endpoint}`,
        count: by.get(endpoint)?.length ?? 0,
      };
    });
    const area = areas.find((a) => a.key === filters.area);
    return {
      options,
      allLabel: area ? `All in ${area.key} ${area.name}` : 'All endpoints',
      allCount: base.length,
    };
  }, [all, filters, groupBy, areas, endpointList]);

  const chips = useMemo((): Chip[] => {
    const out: Chip[] = [];
    if (filters.show && valueDim)
      out.push({
        key: 'show',
        label: DIMENSION_LABEL[groupBy],
        value: filters.show,
        remove: (f) => ({ ...f, show: '' }),
      });
    if (filters.statuses.length)
      out.push({
        key: 'status',
        label: 'Status',
        value: statusLabel(filters.statuses),
        remove: (f) => ({ ...f, statuses: [] }),
      });
    if (filters.area) {
      const a = areas.find((x) => x.key === filters.area);
      out.push({
        key: 'area',
        label: 'Area',
        value: a ? `${a.key} ${a.name}` : filters.area,
        remove: (f) => ({ ...f, area: '' }),
      });
    }
    if (filters.endpoint) {
      const p = plainEndpoint(filters.endpoint, endpointList);
      out.push({
        key: 'endpoint',
        label: 'Endpoint',
        value: p.path.startsWith('/') ? `${p.method} ${p.path}` : p.name,
        remove: (f) => ({ ...f, endpoint: '' }),
      });
    }
    if (filters.q)
      out.push({ key: 'q', label: 'Search', value: `“${filters.q}”`, remove: (f) => ({ ...f, q: '' }) });
    return out;
  }, [filters, groupBy, valueDim, areas, endpointList]);

  const exportView = () => {
    const base = `pii-report-${report.run.runId}-view`.replace(/[^a-z0-9-]+/gi, '-');
    // The same columns as results.csv (already-sanitized report data), only the tests in the current view.
    download(`${base}.csv`, testsToCsv(list), 'text/csv');
    toast(`Exported ${list.length} test${list.length === 1 ? '' : 's'} (current view)`);
  };

  return (
    <div class="filters no-print">
      <div class="filter-bar" role="group" aria-label="Test filters">
        <FilterSelect
          label="Group by"
          value={groupBy}
          options={groupOptions}
          onChange={(v) => setGroupBy(v as GroupBy)}
        />
        {showOptions && (
          <FilterSelect
            label="Show"
            value={filters.show}
            options={showOptions}
            onChange={(v) => setFilters((f) => ({ ...f, show: v }))}
          />
        )}
        <FilterSelect
          label="Status"
          value={filters.statuses.join(',')}
          options={statusOptions}
          onChange={(v) =>
            setFilters((f) => ({ ...f, statuses: v.split(',').filter(Boolean) as StatusFilter[] }))
          }
        />
        {areas.length > 0 && (
          <FilterSelect
            label="Area"
            wide
            value={filters.area}
            options={areaOptions}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                area: v,
                // An endpoint outside the newly chosen area no longer applies.
                endpoint: v && f.endpoint && areaOfEndpoint(f.endpoint) !== v ? '' : f.endpoint,
              }))
            }
          />
        )}
        {endpointPicker && (
          <EndpointCombobox
            label="Endpoint"
            allLabel={endpointPicker.allLabel}
            allCount={endpointPicker.allCount}
            value={filters.endpoint}
            options={endpointPicker.options}
            onChange={(key) =>
              setFilters((f) => ({
                ...f,
                endpoint: key,
                // Picking an endpoint under "All areas" narrows the area to the endpoint's own.
                area: key && !f.area ? areaOfEndpoint(key) : f.area,
              }))
            }
          />
        )}
        <label class="search">
          <Icon name="search" size={16} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search tests…  ( / )"
            aria-label="Search tests"
            value={filters.q}
            onInput={(e) => setFilters((f) => ({ ...f, q: (e.target as HTMLInputElement).value }))}
          />
        </label>
        {chips.length === 0 && (
          <span class="filter-count small muted" role="status">
            <strong class="tabular">{all.length}</strong> tests
          </span>
        )}
        <button
          class="btn btn--sm filter-bar__export"
          disabled={list.length === 0}
          onClick={exportView}
          title="Download the tests in the current view as CSV"
        >
          <Icon name="csv" size={14} /> Export CSV
        </button>
      </div>
      {chips.length > 0 && (
        <div class="filter-chips" role="group" aria-label="Active filters">
          {chips.map((c) => (
            <button
              key={c.key}
              class="chip filter-chip"
              aria-label={`Remove filter ${c.label}: ${c.value}`}
              title={`${c.label}: ${c.value} — click to remove`}
              onClick={() => setFilters(c.remove)}
            >
              <span class="filter-chip__label">{c.label}:</span>
              <span class="filter-chip__value">{c.value}</span>
              <Icon name="x" size={12} />
            </button>
          ))}
          <span class="filter-count small muted" role="status">
            Showing <strong class="tabular">{list.length}</strong> of{' '}
            <span class="tabular">{all.length}</span> tests
          </span>
          <button class="btn btn--sm btn--ghost" onClick={clearFilters}>
            <Icon name="x" size={14} /> Clear all
          </button>
        </div>
      )}
    </div>
  );
}

export function TestList() {
  const { service, all, list, filters, openTest, isPrint, ui, groupBy, endpointList } = useApp();
  const anyOverlay = ui.palette || ui.shortcuts || ui.guide || ui.methodology;
  // The page belongs to the current filters: new filters start at page 1 in the same render (no reset
  // effect that could race a quick ← / → key press).
  const [paging, setPaging] = useState({ filters, page: 0 });
  const page = paging.filters === filters ? paging.page : 0;
  // Always read the latest filters / page count, even from a key listener registered one render ago.
  const latest = useRef({ filters, pages: 1, blocked: false });
  latest.current.filters = filters;
  latest.current.blocked = Boolean(ui.drawer || ui.panel) || anyOverlay;
  const setPage = (next: (p: number) => number) =>
    setPaging((cur) => {
      const f = latest.current.filters;
      const p = next(cur.filters === f ? cur.page : 0);
      return { filters: f, page: Math.min(latest.current.pages - 1, Math.max(0, p)) };
    });
  const searchRef = useRef<HTMLInputElement>(null);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  latest.current.pages = pages;

  // "/" jumps to the search box; ← / → change page (not while typing, or while a panel is open).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !latest.current.blocked) {
        e.preventDefault();
        setPage((p) => p + (e.key === 'ArrowRight' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const sorted = list;
  // PDF: every non-passing test plus up to 150 passing ones, still grouped by endpoint (full list: results.csv).
  const rows = useMemo(() => {
    if (!isPrint) return sorted.slice(page * PAGE, page * PAGE + PAGE);
    let passes = 0;
    return sorted.filter((t) => t.status !== 'PASS' || passes++ < 150);
  }, [sorted, isPrint, page]);
  // Consecutive rows with the same heading (endpoint / type / suite) form one group; "None" = one group, no heading.
  const groups = useMemo(() => {
    const out: { endpoint: string; tests: typeof rows; continued: boolean }[] = [];
    for (const t of rows) {
      const key = groupKeyOf(t, groupBy);
      const last = out[out.length - 1];
      if (last && last.endpoint === key) last.tests.push(t);
      else out.push({ endpoint: key, tests: [t], continued: false });
    }
    const first = out[0];
    if (first && !isPrint && page > 0) {
      const prev = sorted[page * PAGE - 1];
      first.continued = Boolean(prev && groupKeyOf(prev, groupBy) === first.endpoint);
    }
    return out;
  }, [rows, sorted, page, isPrint, groupBy]);
  const totalFor = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of sorted) m.set(groupKeyOf(t, groupBy), (m.get(groupKeyOf(t, groupBy)) ?? 0) + 1);
    return m;
  }, [sorted, groupBy]);
  // Longest executed test — scales the small time bars.
  const slowest = useMemo(
    () =>
      Math.max(
        1,
        ...service.filter((t) => t.status === 'PASS' || t.status === 'FAIL').map((t) => t.durationMs),
      ),
    [service],
  );

  return (
    <Section
      id="tests"
      num="03"
      eyebrow="Details"
      title="All tests"
      sub={`${all.length} test cases${groupBy === 'none' ? ', sorted by ID' : `, grouped by ${groupBy === 'type' ? 'test type' : groupBy}`}. Click any row to see what it does and why.`}
    >
      <div class="glass glass--pad test-card">
        <FilterBar searchRef={searchRef} />

        {rows.length === 0 ? (
          <EmptyState icon="search" title="No tests match">
            Try another search or show all tests.
          </EmptyState>
        ) : (
          <div class="table-wrap" tabIndex={0} role="region" aria-label="Test list">
            <table class="table" aria-label="Tests">
              <thead>
                <tr>
                  <th scope="col">Result</th>
                  <th scope="col">Test case</th>
                  <th scope="col" class="num">
                    Time
                  </th>
                </tr>
              </thead>
              {groups.map((g) => {
                const head = groupHeading(g.endpoint, groupBy, endpointList);
                const n = totalFor.get(g.endpoint) ?? 0;
                return (
                  <tbody key={`${g.endpoint}-${g.tests[0]?.key}`}>
                    {head && (
                      <tr class="group-row">
                        <th scope="colgroup" colSpan={3}>
                          <span class="group-row__inner">
                            <span class="group-row__icon">
                              <Icon name={head.icon} size={15} />
                            </span>
                            <span class="group-row__name">{head.name}</span>
                            {head.method && (
                              <span class={`method method--${head.method}`}>{head.method}</span>
                            )}
                            {head.path && <code class="group-row__path">{head.path}</code>}
                            {head.note && <span class="group-row__note">{head.note}</span>}
                            <span class="group-row__count">
                              {n} test{n === 1 ? '' : 's'}
                              {g.continued ? ' · continued' : ''}
                            </span>
                          </span>
                        </th>
                      </tr>
                    )}
                    {g.tests.map((t) => (
                      <tr
                        key={t.key}
                        data-status={OUTCOME_META[outcomeOf(t)].token}
                        tabIndex={0}
                        onClick={() => openTest(t.key)}
                        onKeyDown={(e) => e.key === 'Enter' && openTest(t.key)}
                        aria-label={`${t.id}: ${outcomeOf(t)}`}
                      >
                        <td>
                          <OutcomeBadge outcome={outcomeOf(t)} />
                        </td>
                        <td>
                          <div class="test-name">{plainTitle(t.title)}</div>
                          {t.info && <div class="test-what">{t.info.what}</div>}
                          <div class="test-meta">
                            <span class="mono">{t.id}</span>
                            {t.info && <span class={`prio prio--${t.info.priority}`}>{t.info.priority}</span>}
                            {suiteOf(t.tags) === 'Smoke' && <span class="suite suite--Smoke">Smoke</span>}
                            {outcomeOf(t) !== 'Pass' && testOutcome(t).remark !== 'Not part of this run' && (
                              <span class={`test-remark test-remark--${OUTCOME_META[outcomeOf(t)].cls}`}>
                                {testOutcome(t).remark}
                              </span>
                            )}
                          </div>
                        </td>
                        <td class="num nowrap tabular">
                          {RAN.includes(outcomeOf(t)) ? (
                            <span class="timecell">
                              <span class="timebar" aria-hidden="true">
                                <span style={{ width: `${Math.max(4, (t.durationMs / slowest) * 100)}%` }} />
                              </span>
                              {formatDuration(t.durationMs)}
                            </span>
                          ) : (
                            <span class="faint">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
        {isPrint && rows.length < sorted.length && (
          <p class="small muted">
            Showing {rows.length} of {sorted.length} tests — the complete list is in results.csv.
          </p>
        )}
        {!isPrint && sorted.length > PAGE && (
          <div class="pagination no-print">
            <span class="small muted">
              {page * PAGE + 1}–{Math.min(sorted.length, (page + 1) * PAGE)} of {sorted.length}
            </span>
            <div class="row">
              <button
                class="btn btn--sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Previous page"
              >
                <Icon name="chevronLeft" size={14} />
              </button>
              <span class="small tabular">
                {page + 1} / {pages}
              </span>
              <button
                class="btn btn--sm"
                disabled={page >= pages - 1}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
