/**
 * The answer, in one glance: a status pill, a plain sentence, big numbers per status (Pass, Fail, Security finding,
 * Blocked, Skipped, Not Tested, Not Applicable, Total), one bar and the health score.
 */
import { useMemo } from 'preact/hooks';
import {
  compareRuns,
  emptyCounts,
  evaluateGates,
  executedCount,
  formatDuration,
  healthScore,
  OUTCOMES,
  outcomeCounts,
  overallVerdict,
  type Outcome,
  passRate,
  preflightFailures,
  sameProfile,
  toHistoryEntry,
} from '../../../core/analytics';
import type { Counts } from '../../../core/types';
import { Gauge, type Tone } from '../components/ui';
import { useCountUp, useInView } from '../hooks';
import { Icon } from '../icons';
import { OUTCOME_FILTER, useApp } from '../store';
import { fmtDateTime, plural } from '../utils';

/** The one sentence a reader needs. Built only from recorded results. */
export function headline(
  c: Counts,
  preflight: number,
  selfTestsOnly = false,
  /** How many of c.FAIL are known security findings (they still count as failures). */
  findings = 0,
): { text: string; tone: Tone; icon: string; status: string } {
  const executed = executedCount(c);
  const notRun = c.total - executed;
  if (c.total === 0)
    return { text: 'No tests were run.', tone: 'muted', icon: 'minus', status: 'No results' };
  // Only the framework's own unit tests ran: never present that as a verdict on the PII service.
  if (selfTestsOnly)
    return {
      text: 'The Aisle PII API was not tested — only self-tests ran.',
      tone: 'muted',
      icon: 'minus',
      status: 'Service not tested',
    };
  if (preflight > 0 && preflight >= c.FAIL)
    return {
      text: `The Aisle PII facade could not be reached — ${plural(preflight, 'check')} could not run.`,
      tone: 'fail',
      icon: 'server',
      status: 'Service unreachable',
    };
  if (executed === 0)
    return {
      text: `Nothing was tested — ${plural(notRun, 'test is', 'tests are')} not tested.`,
      tone: 'warn',
      icon: 'pause',
      status: 'Not tested',
    };
  if (c.FAIL > 0)
    return {
      text: `${c.FAIL} of ${executed} checks failed${findings > 0 ? ` (${plural(findings, 'security finding')})` : ''} — needs attention.`,
      tone: 'fail',
      icon: 'x',
      status: 'Needs attention',
    };
  if (notRun > 0)
    return {
      text: `All ${executed} checks passed · ${plural(notRun, 'test')} did not run (blocked, skipped or not tested).`,
      tone: 'pass',
      icon: 'check',
      status: 'All clear',
    };
  return { text: `All ${executed} checks passed.`, tone: 'pass', icon: 'check', status: 'All clear' };
}

/** Tile look + help per status (icon + word, never colour alone). */
const TILE: Record<Outcome, { tone: Tone | 'finding' | 'skip' | 'na'; icon: string; help: string }> = {
  Pass: { tone: 'pass', icon: 'check', help: 'Tests that ran and passed.' },
  Fail: {
    tone: 'fail',
    icon: 'x',
    help: 'Tests that ran and found a problem (automation failures to investigate).',
  },
  'Security finding': {
    tone: 'finding',
    icon: 'shield',
    help: 'Tests that fail on a known, reported security issue — expected until Dev fixes it. Still counted as failures.',
  },
  Blocked: {
    tone: 'warn',
    icon: 'pause',
    help: 'Tests that cannot run until Dev answers a question or grants access. Not a pass and not a failure.',
  },
  Skipped: {
    tone: 'skip',
    icon: 'skip',
    help: 'Tests skipped in this run (e.g. optional setup not configured).',
  },
  'Not Applicable': {
    tone: 'na',
    icon: 'ban',
    help: 'Tests for a feature Dev confirmed is intentionally not supported. Neither a pass nor a failure — left out of the pass rate, quality gates and health score.',
  },
  'Not Tested': {
    tone: 'muted',
    icon: 'minus',
    help: 'Tests that did not run: not part of this run, the run stopped early, or the Aisle PII facade was unreachable.',
  },
};

/** Tile columns: one row up to 4 tiles, otherwise two balanced rows. */
const statCols = (n: number): number => (n <= 4 ? n : Math.ceil(n / 2));

function BigNumber({
  label,
  value,
  total,
  tone,
  icon,
  onClick,
  help,
}: {
  label: string;
  value: number;
  total: number;
  tone: Tone | 'accent' | 'finding' | 'skip' | 'na';
  icon: string;
  onClick?: () => void;
  help: string;
}) {
  const [ref, inView] = useInView<HTMLButtonElement>(document.documentElement.dataset.print === 'true');
  const shown = useCountUp(value, inView);
  const share = total > 0 ? value / total : 0;
  return (
    <button
      ref={ref}
      class={`stat stat--${tone}`}
      onClick={onClick}
      aria-label={`${label}: ${value}`}
      data-help={help}
      data-help-title={label}
    >
      <span class="stat__top">
        <span class="stat__icon">
          <Icon name={icon} size={16} stroke={2.6} />
        </span>
        <span class="stat__label">{label}</span>
      </span>
      <span class="stat__value">{Math.round(shown)}</span>
      <span class="stat__meter" aria-hidden="true">
        <span style={{ transform: `scaleX(${inView ? share : 0})` }} />
      </span>
    </button>
  );
}

export function Summary() {
  const { report, service, all, showTests, setUi } = useApp();
  // Every status across EVERY test in the suite (tests not in this run count as Not Tested).
  const o = useMemo(() => outcomeCounts(all), [all]);
  // Pass/fail view for the headline and pass rate: a security finding is a failure (never "all clear").
  // Not Applicable tests (feature confirmed unsupported) are left out: nothing to run, nothing missing.
  const c = useMemo(() => {
    const counts = emptyCounts();
    counts.total = all.length - o['Not Applicable'];
    counts.PASS = o.Pass;
    counts.FAIL = o.Fail + o['Security finding'];
    counts.SKIPPED = counts.total - counts.PASS - counts.FAIL;
    return counts;
  }, [all, o]);
  const preflight = preflightFailures(service).length;
  const selfOnly = service.every((t) => t.kind === 'unit');
  const h = headline(c, preflight, selfOnly && c.total > 0, o['Security finding']);
  const health = useMemo(
    () => healthScore(service, report.endpoints, report.config.health),
    [service, report],
  );
  const verdict = overallVerdict(evaluateGates(service, report.config.gates));
  const rate = passRate(c);

  // "vs last run" — only against a run of the same kind (same projects/filters).
  const cmp = useMemo(() => {
    const prev = sameProfile(report.history, report.run.profile).at(-1);
    return compareRuns(toHistoryEntry(report, report.tests), prev);
  }, [report]);

  const segs: [Outcome, number, string][] = OUTCOMES.map((k) => [k, o[k], TILE[k].tone]);
  // Pass, Fail, Not Tested and Total always; Security finding / Blocked / Skipped / Not Applicable only when present.
  const tiles = (
    ['Pass', 'Fail', 'Security finding', 'Blocked', 'Skipped', 'Not Tested', 'Not Applicable'] as const
  ).filter((k) => k === 'Pass' || k === 'Fail' || k === 'Not Tested' || o[k] > 0);

  return (
    <section id="summary" class={`hero glass glass--strong hero--${h.tone}`} aria-labelledby="summary-title">
      <div class="hero__glow" aria-hidden="true" />
      <div class="hero__main">
        <div class="hero__eyebrow">
          <span class={`pill pill--${h.tone}`}>
            <span class="pill__dot" aria-hidden="true" />
            {h.status}
          </span>
          <span class="meta">
            <Icon name="environment" size={14} />
            {report.run.environment.toUpperCase()}
          </span>
          <span class="meta">
            <Icon name="clock" size={14} />
            {fmtDateTime(report.run.startedAt)}
          </span>
          <span class="meta">
            <Icon name="zap" size={14} />
            took {formatDuration(report.run.durationMs)}
          </span>
        </div>

        <h1 id="summary-title" class="hero__title">
          {h.text}
        </h1>

        <div class="stats" style={{ '--stat-cols': statCols(tiles.length + 1) }}>
          {tiles.map((k) => (
            <BigNumber
              key={k}
              label={k}
              value={o[k]}
              total={all.length}
              tone={k === 'Fail' && !o.Fail ? 'muted' : TILE[k].tone}
              icon={TILE[k].icon}
              help={TILE[k].help}
              onClick={() => showTests({ statuses: [OUTCOME_FILTER[k]] })}
            />
          ))}
          <BigNumber
            label="Total"
            value={all.length}
            total={all.length}
            tone="accent"
            icon="tests"
            help="Every test case in the suite."
            onClick={() => showTests({})}
          />
        </div>

        <div
          class="stackbar"
          role="img"
          aria-label={segs
            .filter(([, n]) => n > 0)
            .map(([name, n]) => `${n} ${name.toLowerCase()}`)
            .join(', ')}
        >
          {segs
            .filter(([, n]) => n > 0)
            .map(([name, n, tone]) => (
              <span
                key={name}
                class={`stackbar__seg stackbar__seg--${tone}`}
                style={{ flexGrow: n }}
                title={`${name}: ${n}`}
              />
            ))}
        </div>
        <div class="hero__foot">
          <span class="hero__rate">
            <b>{rate === null ? 'N/A' : `${Math.round(rate * 1000) / 10}%`}</b> of the checks that ran passed
          </span>
          {cmp && (
            <span
              class={`delta ${cmp.deltaFailed > 0 ? 'delta--worse' : cmp.deltaFailed < 0 ? 'delta--better' : ''}`}
              title={`Compared with ${cmp.previous.label}`}
            >
              <Icon name="trends" size={14} /> vs last run:{' '}
              {cmp.deltaFailed === 0 && cmp.deltaPassed === 0
                ? 'no change'
                : `${cmp.deltaPassed >= 0 ? '+' : ''}${cmp.deltaPassed} passed, ${cmp.deltaFailed >= 0 ? '+' : ''}${cmp.deltaFailed} failed`}
            </span>
          )}
        </div>
      </div>

      <aside class="hero__score">
        <div class="hero__score-title">Test health</div>
        <Gauge
          value={health.score}
          label="Test health"
          sub={
            health.score !== null
              ? health.band
              : preflight > 0 || selfOnly
                ? 'not measured'
                : 'not enough data'
          }
        />
        <div
          class={`verdict verdict--${verdict.verdict.split(' ')[0]}`}
          data-help={verdict.explanation}
          data-help-title="Overall verdict"
        >
          {verdict.verdict}
        </div>
        <button class="linkish no-print" onClick={() => setUi({ methodology: true })}>
          How is this score calculated?
        </button>
      </aside>
    </section>
  );
}
