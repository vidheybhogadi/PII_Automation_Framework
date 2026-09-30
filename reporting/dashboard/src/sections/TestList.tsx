/**
 * "All tests" — every test in the suite, grouped by endpoint: Pass / Fail / Security finding / Blocked / Skipped /
 * Not Tested / Not Applicable (tab shown only when present), a one-line description, search.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatDuration, OUTCOMES, testOutcome, type Outcome } from '../../../core/analytics';
import { suiteOf } from '../../../core/catalog';
import { EmptyState, OUTCOME_META, OutcomeBadge, Section } from '../components/ui';
import { Icon } from '../icons';
import { plainEndpoint, plainTitle } from '../plain';
import {
  GROUP_BY_OPTIONS,
  groupKeyOf,
  OUTCOME_FILTER,
  outcomeMatches,
  outcomeOf,
  useApp,
  type GroupBy,
} from '../store';
import { isTypingTarget, type StatusFilter } from '../utils';

const PAGE = 20;
/** All · Fail · Security finding · Blocked · Skipped · Not Tested · Not Applicable · Pass (the OUTCOMES order). */
const TABS: { label: string; outcome: Outcome | null; statuses: StatusFilter[] }[] = [
  { label: 'All', outcome: null, statuses: [] },
  ...OUTCOMES.map((o) => ({ label: o, outcome: o, statuses: [OUTCOME_FILTER[o]] })),
];
/** Outcomes of tests that really ran (they have a meaningful duration). */
const RAN: readonly Outcome[] = ['Pass', 'Fail', 'Security finding'];
/** Tabs always shown; the others appear only when some test has that status. */
const ALWAYS: readonly (Outcome | null)[] = [null, 'Fail', 'Pass'];

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
  const meta = (groupBy === 'type' ? TYPE_HEAD : SUITE_HEAD)[key] ?? { icon: 'box', note: '' };
  return { name: key, icon: meta.icon, note: meta.note };
}

export function TestList() {
  const { report, service, all, list, filters, setFilters, openTest, isPrint, ui, groupBy, setGroupBy } =
    useApp();
  const anyOverlay = ui.palette || ui.shortcuts || ui.guide || ui.methodology;
  // The page belongs to the current filters: new filters start at page 1 in the same render (no reset
  // effect that could race a quick ← / → key press).
  const [paging, setPaging] = useState({ filters, page: 0 });
  const page = paging.filters === filters ? paging.page : 0;
  // Always read the latest filters / page count, even from a key listener registered one render ago.
  const latest = useRef({ filters, pages: 1, blocked: false });
  latest.current.filters = filters;
  latest.current.blocked = Boolean(ui.drawer) || anyOverlay;
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
  // PDF: every non-passing test plus up to 150 passing ones (the full list is in results.csv).
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
  const count = (st: StatusFilter[]) => all.filter((t) => outcomeMatches(outcomeOf(t), st)).length;
  const activeTab = TABS.findIndex((t) => t.statuses.join() === filters.statuses.join());
  const tabs = TABS.map((t, i) => ({ ...t, i, n: count(t.statuses) })).filter(
    (t) => ALWAYS.includes(t.outcome) || t.n > 0 || t.i === activeTab,
  );
  const endpointName = filters.endpoint ? plainEndpoint(filters.endpoint).name : '';
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
        <div class="list-tools no-print">
          <div class="groupby" role="group" aria-label="Group by">
            <span class="groupby__label">Group by</span>
            <div class="seg">
              {GROUP_BY_OPTIONS.map((o) => (
                <button key={o.value} aria-pressed={groupBy === o.value} onClick={() => setGroupBy(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div class="seg" role="group" aria-label="Show">
            {tabs.map((t) => (
              <button
                key={t.label}
                aria-pressed={activeTab === t.i}
                onClick={() => setFilters((f) => ({ ...f, statuses: t.statuses }))}
              >
                {t.label} <span class="seg__count">{t.n}</span>
              </button>
            ))}
          </div>
          {endpointName && (
            <button
              class="chip"
              aria-pressed="true"
              onClick={() => setFilters((f) => ({ ...f, endpoint: '' }))}
              aria-label={`Remove endpoint filter ${endpointName}`}
            >
              {endpointName} <Icon name="x" size={12} />
            </button>
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
        </div>

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
                const head = groupHeading(g.endpoint, groupBy, report.endpoints);
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
