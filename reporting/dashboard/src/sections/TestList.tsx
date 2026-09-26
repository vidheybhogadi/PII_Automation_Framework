/** "All tests" — one clean list: search, three status filters, pagination. Click a row for details. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatDuration } from '../../../core/analytics';
import type { TestStatus } from '../../../core/types';
import { EmptyState, Section, StatusBadge } from '../components/ui';
import { Icon } from '../icons';
import { plainArea, plainTitle } from '../plain';
import { NOT_RUN, useApp } from '../store';
import { isTypingTarget } from '../utils';

const PAGE = 20;
const TABS: { label: string; statuses: TestStatus[] }[] = [
  { label: 'All', statuses: [] },
  { label: 'Failed', statuses: ['FAIL'] },
  { label: 'Waiting', statuses: NOT_RUN },
  { label: 'Passed', statuses: ['PASS'] },
];

export function TestList() {
  const { service, list, filters, setFilters, openTest, isPrint, ui } = useApp();
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
  const rows = isPrint
    ? [
        ...sorted.filter((t) => t.status !== 'PASS'),
        ...sorted.filter((t) => t.status === 'PASS').slice(0, 150),
      ]
    : sorted.slice(page * PAGE, page * PAGE + PAGE);
  const count = (st: TestStatus[]) =>
    st.length ? service.filter((t) => st.includes(t.status)).length : service.length;
  const activeTab = TABS.findIndex((t) => t.statuses.join() === filters.statuses.join());
  const areaName = filters.area ? plainArea(filters.area).name : '';
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
      sub={`${service.length} checks in this run. Click any row for details.`}
    >
      <div class="glass glass--pad">
        <div class="list-tools no-print">
          <div class="seg" role="group" aria-label="Show">
            {TABS.map((t, i) => (
              <button
                key={t.label}
                aria-pressed={activeTab === i}
                onClick={() => setFilters((f) => ({ ...f, statuses: t.statuses }))}
              >
                {t.label} <span class="seg__count">{count(t.statuses)}</span>
              </button>
            ))}
          </div>
          {areaName && (
            <button
              class="chip"
              aria-pressed="true"
              onClick={() => setFilters((f) => ({ ...f, area: '' }))}
              aria-label={`Remove area filter ${areaName}`}
            >
              {areaName} <Icon name="x" size={12} />
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
                  <th scope="col">Test</th>
                  <th scope="col">Area</th>
                  <th scope="col" class="num">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr
                    key={t.key}
                    data-status={t.status}
                    tabIndex={0}
                    onClick={() => openTest(t.key)}
                    onKeyDown={(e) => e.key === 'Enter' && openTest(t.key)}
                    aria-label={`${t.id}: ${t.status}`}
                  >
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>
                      <div class="test-name">{plainTitle(t.title)}</div>
                      <div class="xsmall faint mono">{t.id}</div>
                    </td>
                    <td>
                      <span class="tag">{plainArea(t.area).name}</span>
                    </td>
                    <td class="num nowrap tabular">
                      {t.status === 'PASS' || t.status === 'FAIL' ? (
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
