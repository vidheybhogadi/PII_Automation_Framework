/** "How each area did" — security checks and features as simple cards with a ring and one sentence. */
import { useMemo } from 'preact/hooks';
import { countStatuses, executedCount, passRate } from '../../../core/analytics';
import type { AreaKey, ReportTest } from '../../../core/types';
import { Ring, Section } from '../components/ui';
import { Icon } from '../icons';
import { PLAIN_AREAS, plainArea } from '../plain';
import { useApp } from '../store';

interface AreaRow {
  area: AreaKey;
  tests: ReportTest[];
}

/** Columns that leave the fewest empty slots in the last row (6 → 3×2, 9 → 3×3, 8 → 4×2, 5 → 5). */
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

function AreaCard({ row, index }: { row: AreaRow; index: number }) {
  const { showTests } = useApp();
  const p = plainArea(row.area);
  const c = countStatuses(row.tests);
  const executed = executedCount(c);
  const waiting = c.total - executed;
  const rate = passRate(c);
  const state = c.FAIL > 0 ? 'fail' : executed === 0 ? 'muted' : waiting > 0 ? 'warn' : 'pass';
  const label =
    c.FAIL > 0
      ? `${c.FAIL} failed`
      : executed === 0
        ? 'Not run yet'
        : waiting > 0
          ? 'Partly checked'
          : 'All good';
  return (
    <button
      class={`area glass glass--interactive area--${state}`}
      style={{ '--i': index }}
      onClick={() => showTests({ area: row.area })}
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
      <span class="area__means">{p.means}</span>
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

function Group({ title, icon, rows }: { title: string; icon: string; rows: AreaRow[] }) {
  const good = rows.filter((r) => r.tests.every((t) => t.status === 'PASS')).length;
  return (
    <div class="area-group">
      <h3 class="area-group__title">
        <span class="area-group__icon">
          <Icon name={icon} size={15} />
        </span>
        {title}
        <span class="area-group__line" aria-hidden="true" />
        <span class="area-group__score">
          {good}/{rows.length} all good
        </span>
      </h3>
      <div class="area-grid" style={{ '--cols': balancedColumns(rows.length) }}>
        {rows.map((r, i) => (
          <AreaCard key={r.area} row={r} index={i} />
        ))}
      </div>
    </div>
  );
}

export function Areas() {
  const { service } = useApp();
  const rows = useMemo(() => {
    const by = new Map<AreaKey, ReportTest[]>();
    for (const t of service) by.set(t.area, [...(by.get(t.area) ?? []), t]);
    const order = Object.keys(PLAIN_AREAS) as AreaKey[];
    return [...by.entries()]
      .map(([area, tests]) => ({ area, tests }))
      .sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area));
  }, [service]);
  const security = rows.filter((r) => plainArea(r.area).group === 'security');
  const features = rows.filter((r) => plainArea(r.area).group === 'features');
  if (rows.length === 0) return null;
  return (
    <Section
      id="areas"
      num="02"
      eyebrow="Breakdown"
      title="How each area did"
      sub="Click a card to see its tests."
    >
      {security.length > 0 && <Group title="Security checks" icon="shield" rows={security} />}
      {features.length > 0 && <Group title="Features" icon="layers" rows={features} />}
    </Section>
  );
}
