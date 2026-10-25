/**
 * "How each endpoint did" — Milestone 1: one tile per endpoint (method + path) with a ring; click to see its tests.
 * Milestone 2 (~200 APIs): one tile per API area (G1–G10); click an area to open its endpoint tiles.
 */
import { useMemo, useState } from 'preact/hooks';
import type { Outcome } from '../../../core/analytics';
import type { ApiArea, ReportTest } from '../../../core/types';
import { Ring, Section } from '../components/ui';
import { Icon } from '../icons';
import { byEndpoint, plainEndpoint } from '../plain';
import { outcomeOf, useApp } from '../store';
import { plural } from '../utils';

/** Columns that leave the fewest empty slots in the last row (12 → 4×3, 9 → 3×3, 8 → 4×2, 5 → 5). */
export function balancedColumns(n: number, max = 5, min = 3): number {
  if (n <= max) return Math.max(1, n);
  let best = max;
  let bestGap = Infinity;
  for (let cols = max; cols >= min; cols--) {
    const gap = (cols - (n % cols)) % cols;
    if (gap < bestGap) {
      best = cols;
      bestGap = gap;
    }
  }
  return best;
}

/** Tile colour, ring and one-line result for a set of tests — the same outcome rule as the test list. */
function tileStats(tests: readonly ReportTest[]) {
  // Security findings count as failures here.
  const n = (o: Outcome) => tests.filter((t) => outcomeOf(t) === o).length;
  const pass = n('Pass');
  const failN = n('Fail');
  const findings = n('Security finding');
  const blocked = n('Blocked');
  const na = n('Not Applicable');
  const fail = failN + findings;
  const total = tests.length;
  const executed = pass + fail;
  // Not Applicable tests (feature confirmed unsupported) never make an endpoint "partly tested".
  const waiting = total - executed - na;
  const rate = executed ? pass / executed : null;
  const state = fail > 0 ? 'fail' : executed === 0 ? 'muted' : waiting > 0 ? 'warn' : 'pass';
  const label =
    fail > 0
      ? [failN && `${failN} failed`, findings && plural(findings, 'security finding')]
          .filter(Boolean)
          .join(' · ')
      : executed === 0
        ? blocked
          ? `${blocked} blocked`
          : na === total
            ? 'Not applicable'
            : 'Not tested'
        : waiting > 0
          ? blocked
            ? `Partly tested · ${blocked} blocked`
            : 'Partly tested'
          : 'All passed';
  return { pass, fail, blocked, total, rate, state, label };
}

function TileBody({
  icon,
  name,
  stats,
  children,
}: {
  icon: string;
  name: string;
  stats: ReturnType<typeof tileStats>;
  children?: preact.ComponentChildren;
}) {
  const { state, rate, label } = stats;
  return (
    <>
      <span class="area__head">
        <span class="area__icon">
          <Icon name={icon} size={20} />
        </span>
        <span class="area__ring">
          <Ring value={rate} tone={state === 'fail' ? 'fail' : state === 'warn' ? 'warn' : 'pass'} />
          <span class="area__pct">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</span>
        </span>
      </span>
      <span class="area__name">{name}</span>
      {children}
      <span class="area__foot">
        <span class={`status tone--${state}`}>
          <Icon
            name={state === 'fail' ? 'x' : state === 'pass' ? 'check' : state === 'warn' ? 'alert' : 'minus'}
            size={11}
            stroke={2.8}
          />
          {label}
        </span>
        <span class="area__count">
          {stats.pass}/{stats.total}
        </span>
      </span>
    </>
  );
}

function EndpointCard({
  endpoint,
  tests,
  index,
  area,
}: {
  endpoint: string;
  tests: ReportTest[];
  index: number;
  /** Milestone 2: the area the tile sits in (clicking keeps the area filter too). */
  area?: string;
}) {
  const { endpointList, showTests } = useApp();
  const p = plainEndpoint(endpoint, endpointList);
  const stats = tileStats(tests);
  return (
    <button
      class={`area glass glass--interactive area--${stats.state}`}
      style={{ '--i': index }}
      onClick={() => showTests(area ? { area, endpoint } : { endpoint })}
      aria-label={`${p.name}: ${stats.label}. ${stats.pass} of ${stats.total} passed. Show tests.`}
    >
      <TileBody icon={p.icon} name={p.name} stats={stats}>
        <span class="endpoint-path">
          {p.method && <span class={`method method--${p.method}`}>{p.method}</span>}
          <code>{p.path}</code>
        </span>
      </TileBody>
    </button>
  );
}

/** Tests without an area (should not happen for M2) are kept under one extra tile so nothing is hidden. */
const OTHER: ApiArea = { key: '', name: 'Other tests', endpoints: [] };

function AreaCard({
  area,
  tests,
  index,
  expanded,
  onToggle,
}: {
  area: ApiArea;
  tests: ReportTest[];
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const stats = tileStats(tests);
  const endpoints = new Set(tests.map((t) => t.api ?? '')).size;
  const blocked = stats.blocked ? ` · ${stats.blocked} blocked` : '';
  return (
    <button
      class={`area glass glass--interactive area--${stats.state}`}
      style={{ '--i': index }}
      aria-expanded={expanded}
      aria-controls="area-detail"
      onClick={onToggle}
      aria-label={`${area.key ? `${area.key} ` : ''}${area.name}: ${stats.label}. ${stats.pass} passed · ${stats.fail} failed${blocked} of ${stats.total}. ${expanded ? 'Hide' : 'Show'} its endpoints.`}
    >
      <TileBody icon="layers" name={area.name} stats={stats}>
        <span class="endpoint-path">
          {area.key && <span class="method area__key">{area.key}</span>}
          <code>{plural(endpoints, 'endpoint')}</code>
        </span>
        <span class="area__split tabular">
          {stats.pass} passed · {stats.fail} failed{stats.blocked ? ` · ${stats.blocked} blocked` : ''}
        </span>
      </TileBody>
    </button>
  );
}

function AreaTiles({ areas, all }: { areas: ApiArea[]; all: ReportTest[] }) {
  const { showTests, isPrint } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const out = areas.map((a) => ({ area: a, tests: all.filter((t) => t.apiArea === a.key) }));
    const known = new Set(areas.map((a) => a.key));
    const other = all.filter((t) => !t.apiArea || !known.has(t.apiArea));
    if (other.length) out.push({ area: OTHER, tests: other });
    return out.filter((g) => g.tests.length > 0);
  }, [areas, all]);
  const current = open === null ? undefined : groups.find((g) => g.area.key === open);
  const endpoints = useMemo(() => (current ? byEndpoint(current.tests) : []), [current]);
  return (
    <>
      <div class="area-grid" style={{ '--cols': balancedColumns(groups.length) }}>
        {groups.map((g, i) => (
          <AreaCard
            key={g.area.key || '__other'}
            area={g.area}
            tests={g.tests}
            index={i}
            expanded={!isPrint && open === g.area.key}
            onToggle={() => setOpen((o) => (o === g.area.key ? null : g.area.key))}
          />
        ))}
      </div>
      {current && !isPrint && (
        <div
          class="area-detail glass glass--pad no-print"
          id="area-detail"
          role="region"
          aria-label={`${current.area.name} endpoints`}
        >
          <div class="area-detail__head">
            <h3 class="area-detail__title">
              {current.area.key && <span class="method area__key">{current.area.key}</span>}
              {current.area.name}
              <span class="small muted">
                {' '}
                · {plural(endpoints.length, 'endpoint')} · {plural(current.tests.length, 'test')}
              </span>
            </h3>
            <div class="row">
              {current.area.key && (
                <button class="btn btn--sm" onClick={() => showTests({ area: current.area.key })}>
                  <Icon name="filter" size={14} /> Show this area&apos;s tests
                </button>
              )}
              <button class="btn btn--sm" onClick={() => setOpen(null)} aria-label="Close area">
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>
          <div class="area-grid" style={{ '--cols': balancedColumns(endpoints.length) }}>
            {endpoints.map((g, i) => (
              <EndpointCard
                key={g.endpoint}
                endpoint={g.endpoint}
                tests={g.tests}
                index={i}
                area={current.area.key || undefined}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function Endpoints() {
  const { all, areas } = useApp();
  const groups = useMemo(() => byEndpoint(all), [all]);
  if (groups.length === 0) return null;
  const byArea = areas.length > 0;
  return (
    <Section
      id="endpoints"
      num="02"
      eyebrow="Endpoints"
      title="How each endpoint did"
      sub={
        byArea
          ? `One tile per API area (${groups.length} endpoints in ${areas.length} areas). Click an area to see its endpoints, then an endpoint to see its test cases.`
          : 'One tile per endpoint. Click a tile to see its test cases.'
      }
    >
      {byArea ? (
        <AreaTiles areas={areas} all={all} />
      ) : (
        <div class="area-grid" style={{ '--cols': balancedColumns(groups.length) }}>
          {groups.map((g, i) => (
            <EndpointCard key={g.endpoint} endpoint={g.endpoint} tests={g.tests} index={i} />
          ))}
        </div>
      )}
    </Section>
  );
}
