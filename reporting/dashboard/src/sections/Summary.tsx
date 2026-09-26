/** The answer, in one glance: a status pill, a plain sentence, four big numbers, one bar and the health score. */
import { useMemo } from 'preact/hooks';
import {
  compareRuns,
  countStatuses,
  evaluateGates,
  executedCount,
  formatDuration,
  healthScore,
  overallVerdict,
  passRate,
  preflightFailures,
  sameProfile,
  toHistoryEntry,
} from '../../../core/analytics';
import type { Counts } from '../../../core/types';
import { Gauge, type Tone } from '../components/ui';
import { useCountUp, useInView } from '../hooks';
import { Icon } from '../icons';
import { NOT_RUN, useApp } from '../store';
import { fmtDateTime, plural } from '../utils';

/** The one sentence a reader needs. Built only from recorded results. */
export function headline(
  c: Counts,
  preflight: number,
  selfTestsOnly = false,
): { text: string; tone: Tone; icon: string; status: string } {
  const executed = executedCount(c);
  const notRun = c.total - executed;
  if (c.total === 0)
    return { text: 'No tests were run.', tone: 'muted', icon: 'minus', status: 'No results' };
  // Only the framework's own unit tests ran: never present that as a verdict on the PII service.
  if (selfTestsOnly)
    return {
      text: 'The PII service was not tested — only self-tests ran.',
      tone: 'muted',
      icon: 'minus',
      status: 'Service not tested',
    };
  if (preflight > 0 && preflight >= c.FAIL)
    return {
      text: `The PII service could not be reached — ${plural(preflight, 'check')} could not run.`,
      tone: 'fail',
      icon: 'server',
      status: 'Service unreachable',
    };
  if (executed === 0)
    return {
      text: `Nothing ran — ${plural(notRun, 'check is', 'checks are')} waiting.`,
      tone: 'warn',
      icon: 'pause',
      status: 'Waiting',
    };
  if (c.FAIL > 0)
    return {
      text: `${c.FAIL} of ${executed} checks failed — needs attention.`,
      tone: 'fail',
      icon: 'x',
      status: 'Needs attention',
    };
  if (notRun > 0)
    return {
      text: `All ${executed} checks passed · ${plural(notRun, 'check is', 'checks are')} still waiting.`,
      tone: 'pass',
      icon: 'check',
      status: 'All clear',
    };
  return { text: `All ${executed} checks passed.`, tone: 'pass', icon: 'check', status: 'All clear' };
}

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
  tone: Tone | 'accent';
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
  const { report, service, showTests, setUi } = useApp();
  const c = useMemo(() => countStatuses(service), [service]);
  const preflight = preflightFailures(service).length;
  const selfOnly = service.every((t) => t.kind === 'unit');
  const h = headline(c, preflight, selfOnly && c.total > 0);
  const health = useMemo(
    () => healthScore(service, report.endpoints, report.config.health),
    [service, report],
  );
  const verdict = overallVerdict(evaluateGates(service, report.config.gates));
  const notRun = c.total - executedCount(c);
  const rate = passRate(c);

  // "vs last run" — only against a run of the same kind (same projects/filters).
  const cmp = useMemo(() => {
    const prev = sameProfile(report.history, report.run.profile).at(-1);
    return compareRuns(toHistoryEntry(report, report.tests), prev);
  }, [report]);

  const segs: [string, number, string][] = [
    ['Passed', c.PASS, 'pass'],
    ['Failed', c.FAIL, 'fail'],
    ['Waiting', c.BLOCKED + c.FIXME, 'warn'],
    ['Not run', c.SKIPPED + c.UNKNOWN, 'muted'],
  ];

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

        <div class="stats">
          <BigNumber
            label="Passed"
            value={c.PASS}
            total={c.total}
            tone="pass"
            icon="check"
            help="Checks that ran and were fine."
            onClick={() => showTests({ statuses: ['PASS'] })}
          />
          <BigNumber
            label="Failed"
            value={c.FAIL}
            total={c.total}
            tone={c.FAIL ? 'fail' : 'muted'}
            icon="x"
            help="Checks that ran and found a problem."
            onClick={() => showTests({ statuses: ['FAIL'] })}
          />
          <BigNumber
            label="Waiting"
            value={notRun}
            total={c.total}
            tone={notRun ? 'warn' : 'muted'}
            icon="pause"
            help="Checks that could not run yet — usually waiting on information from the backend team."
            onClick={() => showTests({ statuses: NOT_RUN })}
          />
          <BigNumber
            label="Total"
            value={c.total}
            total={c.total}
            tone="accent"
            icon="tests"
            help="All checks in this run."
            onClick={() => showTests({})}
          />
        </div>

        <div class="stackbar" role="img" aria-label={`${c.PASS} passed, ${c.FAIL} failed, ${notRun} waiting`}>
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
        <div class="hero__score-title">Health score</div>
        <Gauge
          value={health.score}
          label="Health score"
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
