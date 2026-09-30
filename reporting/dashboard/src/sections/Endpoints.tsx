/** "How each endpoint did" — one tile per endpoint (method + path) with a ring; click to see its tests. */
import { useMemo } from 'preact/hooks';
import { ENDPOINT_GROUP_ORDER } from '../../../core/catalog';
import type { Outcome } from '../../../core/analytics';
import type { ReportTest } from '../../../core/types';
import { Ring, Section } from '../components/ui';
import { Icon } from '../icons';
import { endpointOf, plainEndpoint } from '../plain';
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

function EndpointCard({ endpoint, tests, index }: { endpoint: string; tests: ReportTest[]; index: number }) {
  const { report, showTests } = useApp();
  const p = plainEndpoint(endpoint, report.endpoints);
  // The same outcome rule as the test list and the Excel sheet. Security findings count as failures here.
  const n = (o: Outcome) => tests.filter((t) => outcomeOf(t) === o).length;
  const pass = n('Pass');
  const failN = n('Fail');
  const findings = n('Security finding');
  const blocked = n('Blocked');
  const na = n('Not Applicable');
  const fail = failN + findings;
  const c = { PASS: pass, FAIL: fail, total: tests.length };
  const executed = pass + fail;
  // Not Applicable tests (feature confirmed unsupported) never make an endpoint "partly tested".
  const waiting = c.total - executed - na;
  const rate = executed ? pass / executed : null;
  const state = c.FAIL > 0 ? 'fail' : executed === 0 ? 'muted' : waiting > 0 ? 'warn' : 'pass';
  const label =
    c.FAIL > 0
      ? [failN && `${failN} failed`, findings && plural(findings, 'security finding')]
          .filter(Boolean)
          .join(' · ')
      : executed === 0
        ? blocked
          ? `${blocked} blocked`
          : na === c.total
            ? 'Not applicable'
            : 'Not tested'
        : waiting > 0
          ? blocked
            ? `Partly tested · ${blocked} blocked`
            : 'Partly tested'
          : 'All passed';
  return (
    <button
      class={`area glass glass--interactive area--${state}`}
      style={{ '--i': index }}
      onClick={() => showTests({ endpoint })}
      aria-label={`${p.name}: ${label}. ${c.PASS} of ${c.total} passed. Show tests.`}
    >
      <span class="area__head">
        <span class="area__icon">
          <Icon name={p.icon} size={20} />
        </span>
        <span class="area__ring">
          <Ring value={rate} tone={state === 'fail' ? 'fail' : state === 'warn' ? 'warn' : 'pass'} />
          <span class="area__pct">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</span>
        </span>
      </span>
      <span class="area__name">{p.name}</span>
      <span class="endpoint-path">
        {p.method && <span class={`method method--${p.method}`}>{p.method}</span>}
        <code>{p.path}</code>
      </span>
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
          {c.PASS}/{c.total}
        </span>
      </span>
    </button>
  );
}

export function Endpoints() {
  const { all } = useApp();
  const groups = useMemo(() => {
    const by = new Map<string, ReportTest[]>();
    for (const t of all) by.set(endpointOf(t), [...(by.get(endpointOf(t)) ?? []), t]);
    // Known endpoints in the guide's order, then any new endpoint found in the tests (so new tests always show).
    const known = (ENDPOINT_GROUP_ORDER as readonly string[]).filter((k) => by.has(k));
    const extra = [...by.keys()].filter((k) => !known.includes(k)).sort();
    return [...known, ...extra].map((k) => ({ endpoint: k, tests: by.get(k) as ReportTest[] }));
  }, [all]);
  if (groups.length === 0) return null;
  return (
    <Section
      id="endpoints"
      num="02"
      eyebrow="Endpoints"
      title="How each endpoint did"
      sub="One tile per endpoint. Click a tile to see its test cases."
    >
      <div class="area-grid" style={{ '--cols': balancedColumns(groups.length) }}>
        {groups.map((g, i) => (
          <EndpointCard key={g.endpoint} endpoint={g.endpoint} tests={g.tests} index={i} />
        ))}
      </div>
    </Section>
  );
}
