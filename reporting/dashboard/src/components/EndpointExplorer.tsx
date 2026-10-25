/**
 * The endpoint explorer in the side panel ("How each endpoint did"). Milestone 2: an API area (level 1: its
 * endpoints) → one endpoint (level 2: its tests by type) → one test (level 3: the usual test details). Milestone 1
 * has no areas and opens at level 2. The state lives in the URL hash (panelArea / panelEndpoint / test).
 */
import { useMemo, useState } from 'preact/hooks';
import { OUTCOMES } from '../../../core/analytics';
import type { ApiArea, ReportTest } from '../../../core/types';
import { Icon } from '../icons';
import { byEndpoint, endpointOf, plainEndpoint, plainTitle } from '../plain';
import { outcomeOf, tally, TYPE_ORDER, typeOf, useApp, type Tally } from '../store';
import { plural, type Panel } from '../utils';
import { Method, OUTCOME_META, Ring } from './ui';

/** Key of the extra area that keeps tests without a known area (should not happen for M2) visible. */
export const OTHER_AREA = '__other';
export const OTHER_AREA_INFO: ApiArea = { key: OTHER_AREA, name: 'Other tests', endpoints: [] };

/** The tests of an area; OTHER_AREA = tests without a known area. */
export function areaTests(all: readonly ReportTest[], areas: readonly ApiArea[], key: string): ReportTest[] {
  if (key !== OTHER_AREA) return all.filter((t) => t.apiArea === key);
  const known = new Set(areas.map((a) => a.key));
  return all.filter((t) => !t.apiArea || !known.has(t.apiArea));
}

const OUTCOME_RANK = new Map(OUTCOMES.map((o, i) => [o, i]));
const byOutcomeThenId = (a: ReportTest, b: ReportTest) =>
  (OUTCOME_RANK.get(outcomeOf(a)) ?? 0) - (OUTCOME_RANK.get(outcomeOf(b)) ?? 0) ||
  a.id.localeCompare(b.id, undefined, { numeric: true });

/** An endpoint's tests grouped by test type (Positive, Negative, …), failures first inside each type. */
export function testsByType(tests: readonly ReportTest[]): { type: string; tests: ReportTest[] }[] {
  const by = new Map<string, ReportTest[]>();
  for (const t of tests) by.set(typeOf(t), [...(by.get(typeOf(t)) ?? []), t]);
  const rank = (k: string) => {
    const i = (TYPE_ORDER as readonly string[]).indexOf(k);
    return i < 0 ? TYPE_ORDER.length : i;
  };
  return [...by.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([type, list]) => ({ type, tests: [...list].sort(byOutcomeThenId) }));
}

export interface ExplorerContext {
  panel: Panel;
  area: ApiArea | null;
  areaTests: ReportTest[];
  endpoint: string | null;
  endpointTests: ReportTest[];
  /** The endpoint's tests in the order they are listed (J / K at level 3 follow it). */
  ordered: ReportTest[];
}

/** Resolves the panel state from the hash / clicks; null when it points at nothing in this report. */
export function useExplorer(panel: Panel | null): ExplorerContext | null {
  const { all, areas } = useApp();
  return useMemo(() => {
    if (!panel) return null;
    const area = panel.area
      ? panel.area === OTHER_AREA
        ? OTHER_AREA_INFO
        : (areas.find((a) => a.key === panel.area) ?? null)
      : null;
    if (panel.area && !area) return null;
    const inArea = area ? areaTests(all, areas, area.key) : all;
    const endpointTests = panel.endpoint ? inArea.filter((t) => endpointOf(t) === panel.endpoint) : [];
    if (panel.endpoint && endpointTests.length === 0) return null;
    if (!area && !panel.endpoint) return null;
    return {
      panel,
      area,
      areaTests: inArea,
      endpoint: panel.endpoint,
      endpointTests,
      ordered: testsByType(endpointTests).flatMap((g) => g.tests),
    };
  }, [panel, all, areas]);
}

/** "G3 Profile reads" */
export const areaLabel = (a: ApiArea): string => (a.key === OTHER_AREA ? a.name : `${a.key} ${a.name}`);

/** "POST /V1/like" (or the friendly name when the endpoint has no path, e.g. "Across endpoints"). */
export function endpointLabel(key: string, endpoints: Parameters<typeof plainEndpoint>[1]): string {
  const p = plainEndpoint(key, endpoints);
  return p.path.startsWith('/') ? `${p.method} ${p.path}` : p.name;
}

/** Breadcrumb with a back arrow (up one level). The last item is the current page. */
export function Crumbs({
  items,
  onBack,
  backLabel,
}: {
  items: { label: string; onClick?: () => void }[];
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <nav class="crumbs" aria-label="Breadcrumb">
      {onBack && (
        <button
          class="btn btn--icon btn--ghost btn--sm"
          aria-label={backLabel ?? 'Back'}
          title={backLabel ?? 'Back'}
          data-autofocus
          onClick={onBack}
        >
          <Icon name="chevronLeft" size={16} />
        </button>
      )}
      <ol class="crumbs__list">
        {items.map((it, i) => (
          <li key={i} class="crumbs__item">
            {i < items.length - 1 && it.onClick ? (
              <button class="crumbs__link" onClick={it.onClick}>
                {it.label}
              </button>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined}>{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A small pass / fail / blocked / other bar. */
function MiniBar({ t }: { t: Tally }) {
  const other = t.total - t.pass - t.fail - t.blocked;
  const text = `${t.pass} passed, ${t.fail} failed, ${t.blocked} blocked${other ? `, ${other} other` : ''}`;
  return (
    <span class="minibar" role="img" aria-label={text} title={text}>
      {t.pass > 0 && <span class="minibar__seg minibar__seg--pass" style={{ flexGrow: t.pass }} />}
      {t.fail > 0 && <span class="minibar__seg minibar__seg--fail" style={{ flexGrow: t.fail }} />}
      {t.blocked > 0 && <span class="minibar__seg minibar__seg--warn" style={{ flexGrow: t.blocked }} />}
      {other > 0 && <span class="minibar__seg minibar__seg--muted" style={{ flexGrow: other }} />}
    </span>
  );
}

/** Ring + "x passed · y failed · z blocked of n tests" for the panel header. */
function Score({ tests }: { tests: readonly ReportTest[] }) {
  const t = tally(tests);
  const ran = t.pass + t.fail;
  const rate = ran ? t.pass / ran : null;
  return (
    <div class="xscore">
      <span class="area__ring">
        <Ring value={rate} tone={t.fail ? 'fail' : t.blocked ? 'warn' : 'pass'} />
        <span class="area__pct">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</span>
      </span>
      <span class="xscore__counts small">
        <span class="xscore__n xscore__n--pass">{t.pass} passed</span>
        <span class="xscore__n xscore__n--fail">{t.fail} failed</span>
        <span class="xscore__n xscore__n--warn">{t.blocked} blocked</span>
        <span class="muted">of {plural(t.total, 'test')}</span>
      </span>
    </div>
  );
}

function HeadActions({ onShow, showLabel }: { onShow?: () => void; showLabel: string }) {
  const { setUi } = useApp();
  return (
    <div class="row xhead__actions">
      {onShow && (
        <button class="btn btn--sm" onClick={onShow} title={showLabel}>
          <Icon name="filter" size={14} /> Show in test list
        </button>
      )}
      <button
        class="btn btn--icon btn--ghost"
        aria-label="Close"
        data-autofocus-fallback
        onClick={() => setUi({ drawer: null, panel: null })}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

/** Level 1: an API area and its endpoints (searchable). */
function AreaLevel({ ctx }: { ctx: ExplorerContext }) {
  const { setUi, showTests, endpointList } = useApp();
  const area = ctx.area as ApiArea;
  const [q, setQ] = useState('');
  const rows = useMemo(
    () =>
      byEndpoint(ctx.areaTests).map(({ endpoint, tests }) => {
        const p = plainEndpoint(endpoint, endpointList);
        return { key: endpoint, p, tally: tally(tests) };
      }),
    [ctx.areaTests, endpointList],
  );
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) =>
    tokens.every((tok) => `${r.p.method} ${r.p.path} ${r.p.name} ${r.key}`.toLowerCase().includes(tok)),
  );
  return (
    <>
      <div class="drawer__head">
        <div class="row row--between xhead">
          <span class="tag tag--accent">
            <Icon name="layers" size={12} /> API area
          </span>
          <HeadActions
            showLabel={`Show the tests of ${areaLabel(area)} in the test list`}
            onShow={
              area.key === OTHER_AREA
                ? undefined
                : () => {
                    setUi({ panel: null, drawer: null });
                    showTests({ area: area.key });
                  }
            }
          />
        </div>
        <h3 id="drawer-title" class="drawer__title">
          {area.key !== OTHER_AREA && <span class="method area__key">{area.key}</span>} {area.name}
        </h3>
        <Score tests={ctx.areaTests} />
      </div>
      <div class="drawer__body">
        <label class="search search--panel">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Filter endpoints…"
            aria-label="Filter endpoints"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          />
        </label>
        <div class="xsmall muted" role="status">
          {tokens.length
            ? `${shown.length} of ${plural(rows.length, 'endpoint')}`
            : plural(rows.length, 'endpoint')}
        </div>
        {shown.length === 0 ? (
          <p class="small muted">No endpoint matches “{q}”.</p>
        ) : (
          <ul class="xlist">
            {shown.map((r) => (
              <li key={r.key}>
                <button
                  class="xrow"
                  onClick={() => setUi({ panel: { area: ctx.panel.area, endpoint: r.key } })}
                  aria-label={`${r.p.method} ${r.p.path || r.p.name}: ${r.tally.pass} passed, ${r.tally.fail} failed, ${r.tally.blocked} blocked of ${plural(r.tally.total, 'test')}. Open its tests.`}
                >
                  <span class="xrow__top">
                    {r.p.method && <Method method={r.p.method} />}
                    <code class="xrow__path">{r.p.path || r.p.name}</code>
                  </span>
                  <span class="xrow__name">
                    {r.p.name}
                    {r.p.name !== r.key && r.p.path.startsWith('/') && <span class="faint"> · {r.key}</span>}
                  </span>
                  <span class="xrow__foot">
                    <MiniBar t={r.tally} />
                    <span class="xrow__count tabular">{plural(r.tally.total, 'test')}</span>
                    <Icon name="chevronRight" size={14} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Level 2: one endpoint and its tests, grouped by test type, each with a status dot. */
function EndpointLevel({ ctx }: { ctx: ExplorerContext }) {
  const { setUi, showTests, endpointList } = useApp();
  const key = ctx.endpoint as string;
  const p = plainEndpoint(key, endpointList);
  const groups = useMemo(() => testsByType(ctx.endpointTests), [ctx.endpointTests]);
  const area = ctx.area;
  const toArea = area ? () => setUi({ panel: { area: ctx.panel.area, endpoint: null } }) : undefined;
  return (
    <>
      <div class="drawer__head">
        <div class="row row--between xhead">
          {area ? (
            <Crumbs
              items={[
                { label: areaLabel(area), onClick: toArea },
                { label: endpointLabel(key, endpointList) },
              ]}
              onBack={toArea}
              backLabel={`Back to ${areaLabel(area)}`}
            />
          ) : (
            <span class="tag tag--accent">
              <Icon name={p.icon} size={12} /> Endpoint
            </span>
          )}
          <HeadActions
            showLabel={`Show the tests of ${endpointLabel(key, endpointList)} in the test list`}
            onShow={() => {
              setUi({ panel: null, drawer: null });
              showTests(
                area && area.key !== OTHER_AREA ? { area: area.key, endpoint: key } : { endpoint: key },
              );
            }}
          />
        </div>
        <h3 id="drawer-title" class="drawer__title">
          {p.name}
        </h3>
        <div class="xendpoint">
          {p.method && <Method method={p.method} />}
          <code class="xendpoint__path">{p.path}</code>
        </div>
        {p.means && <p class="small muted xendpoint__means">{p.means}</p>}
        <Score tests={ctx.endpointTests} />
      </div>
      <div class="drawer__body" tabIndex={0} role="region" aria-label="Tests of this endpoint">
        {groups.map((g) => (
          <section key={g.type} aria-label={`${g.type} tests`}>
            <div class="subhead">
              {g.type} <span class="faint">({g.tests.length})</span>
            </div>
            <ul class="xtests">
              {g.tests.map((t) => {
                const o = outcomeOf(t);
                return (
                  <li key={t.key}>
                    <button class="xtest" onClick={() => setUi({ drawer: t.key })} title={`${t.id}: ${o}`}>
                      <span class={`xdot xdot--${OUTCOME_META[o].cls}`} aria-hidden="true" />
                      <span class="sr-only">{o}:</span>
                      <span class="xtest__id mono">{t.id}</span>
                      <span class="xtest__title">{plainTitle(t.title)}</span>
                      <Icon name="chevronRight" size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** Levels 1 and 2 (level 3 is the test details, rendered by the drawer with a breadcrumb). */
export function ExplorerLevel({ ctx }: { ctx: ExplorerContext }) {
  return ctx.endpoint ? <EndpointLevel ctx={ctx} /> : <AreaLevel ctx={ctx} />;
}
