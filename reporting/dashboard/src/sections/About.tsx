/** "About this run" — the few facts people ask for, plus framework self-tests and any data caveats. */
import { useMemo } from 'preact/hooks';
import {
  countStatuses,
  dataLeftBehind,
  flattenCalls,
  formatDuration,
  formatMs,
  latencyStats,
  responseLatencies,
} from '../../../core/analytics';
import { CopyButton, Section, Term } from '../components/ui';
import { Icon } from '../icons';
import { useApp } from '../store';
import { fmtDateTime } from '../utils';

export function About() {
  const { report, service, selfTests } = useApp();
  const speed = useMemo(
    () => latencyStats(responseLatencies(flattenCalls(service).filter((c) => c.phase !== 'preflight'))),
    [service],
  );
  const self = countStatuses(selfTests);
  const leftBehind = dataLeftBehind(service);
  const r = report.run;
  const facts: [string, string, preact.ComponentChildren][] = [
    ['environment', 'Environment', r.environment.toUpperCase()],
    ['clock', 'Started', fmtDateTime(r.startedAt)],
    ['zap', 'Duration', formatDuration(r.durationMs)],
    [
      'activity',
      'Typical response time',
      speed ? `${formatMs(speed.p50)} · 95% under ${formatMs(speed.p95)}` : 'N/A — no responses recorded',
    ],
    [
      'check',
      'Framework self-tests',
      self.total ? `${self.PASS}/${self.total} passed` : 'not part of this run',
    ],
    ['database', 'Test data left behind', `${leftBehind} record(s) — no delete API yet`],
    [
      'hash',
      'Commit',
      r.git.commit ? (
        <>
          <code>{r.git.commit.slice(0, 10)}</code>
          <CopyButton text={r.git.commit} label="Copy commit" />
        </>
      ) : (
        'N/A'
      ),
    ],
    [
      'book',
      'Report',
      `${report.meta.product} v${report.meta.reportVersion} · ${report.meta.dataSource === 'DEMO' ? 'demo data' : 'real run'}`,
    ],
  ];
  return (
    <Section id="about" num="04" eyebrow="Context" title="About this run">
      {report.diagnostics.length > 0 && (
        <div class="banner banner--warn" role="status">
          <Icon name="info" />
          <div>
            <b>Good to know</b>
            <ul>
              {report.diagnostics.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div class="facts">
        {facts.map(([icon, label, value]) => (
          <div class="fact glass" key={label}>
            <span class="fact__icon">
              <Icon name={icon} size={17} />
            </span>
            <span class="fact__body">
              <span class="fact__k">
                {label === 'Typical response time' ? <Term term="Latency">{label}</Term> : label}
              </span>
              <span class="fact__v">{value}</span>
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
