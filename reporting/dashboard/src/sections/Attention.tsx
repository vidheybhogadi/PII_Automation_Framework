/** "What needs attention" — failures first, then checks that are waiting. Plain language, click for details. */
import { useMemo, useState } from 'preact/hooks';
import {
  analyzeFailure,
  FAILURE_PATTERNS,
  preflightFailures,
  questionIdOf,
  SEVERITY_RANK,
} from '../../../core/analytics';
import { EmptyState, Section } from '../components/ui';
import { Icon } from '../icons';
import { endpointOf, plainEndpoint, plainTitle } from '../plain';
import { NOT_RUN, useApp } from '../store';
import { plural } from '../utils';

export function Attention() {
  const { report, service, openTest, showTests } = useApp();
  const [showAll, setShowAll] = useState(false);
  const preflight = useMemo(() => preflightFailures(service), [service]);
  const failures = useMemo(
    () =>
      service
        .filter((t) => t.status === 'FAIL' && !preflight.includes(t))
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
        .map(analyzeFailure),
    [service, preflight],
  );
  const waiting = useMemo(() => service.filter((t) => NOT_RUN.includes(t.status)), [service]);
  const questions = useMemo(() => [...new Set(waiting.map(questionIdOf).filter(Boolean))], [waiting]);
  const shown = showAll ? failures : failures.slice(0, 6);
  const nothing = failures.length === 0 && waiting.length === 0 && preflight.length === 0;

  return (
    <Section
      id="attention"
      num="01"
      eyebrow="Problems"
      title="What needs attention"
      sub={nothing ? undefined : 'Start here. Click any card for details.'}
      aside={
        !nothing && (
          <span class="count-pill">
            {failures.length + preflight.length > 0 && (
              <span class="count-pill__item count-pill__item--fail">
                {failures.length + (preflight.length ? 1 : 0)} to fix
              </span>
            )}
            {waiting.length > 0 && (
              <span class="count-pill__item count-pill__item--warn">{waiting.length} waiting</span>
            )}
          </span>
        )
      }
    >
      {nothing ? (
        <EmptyState icon="check" title="Nothing needs attention">
          {service.some((t) => t.status === 'PASS')
            ? 'Every check that ran passed.'
            : 'No checks ran in this report.'}
        </EmptyState>
      ) : (
        <div class="attention">
          {preflight.length > 0 && (
            <div class="alert-card alert-card--fail alert-card--wide glass">
              <span class="alert-card__icon">
                <Icon name="server" size={22} />
              </span>
              <div class="grow">
                <div class="alert-card__title">The PII service could not be reached</div>
                <div class="alert-card__text">
                  {plural(preflight.length, 'check')} could not run. This is an environment problem (address,
                  network/VPN or the service being down) — not a problem with the individual checks.
                </div>
              </div>
            </div>
          )}

          {shown.map((f) => {
            const ep = plainEndpoint(endpointOf(f.test), report.endpoints);
            return (
              <button
                key={f.test.key}
                class="alert-card alert-card--fail problem glass glass--interactive"
                onClick={() => openTest(f.test.key)}
              >
                <span class="problem__top">
                  <span class="problem__area">
                    <Icon name={ep.icon} size={14} />
                    {ep.name}
                    {ep.method && <span class="problem__path">{`${ep.method} ${ep.path}`}</span>}
                  </span>
                  {f.test.severity === 'critical' && <span class="sev">Critical</span>}
                  <Icon name="chevronRight" size={16} class="problem__go" />
                </span>
                <span class="problem__title">{plainTitle(f.test.title)}</span>
                {f.expected && f.received ? (
                  <span class="xdiff">
                    <span class="xdiff__box xdiff__box--exp" title={f.expected}>
                      <small>Expected</small>
                      <b>{f.expected}</b>
                    </span>
                    <span class="xdiff__arrow" aria-hidden="true">
                      <Icon name="chevronRight" size={14} stroke={2.6} />
                    </span>
                    <span class="xdiff__box xdiff__box--got" title={f.received}>
                      <small>Got</small>
                      <b>{f.received}</b>
                    </span>
                  </span>
                ) : (
                  <span class="alert-card__text">{FAILURE_PATTERNS[f.pattern].label}</span>
                )}
              </button>
            );
          })}
          {failures.length > 6 && (
            <button class="btn btn--sm attention__more" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${failures.length} failures`}
            </button>
          )}

          {waiting.length > 0 && (
            <button
              class="alert-card alert-card--warn alert-card--wide glass glass--interactive"
              onClick={() => showTests({ statuses: NOT_RUN })}
            >
              <span class="alert-card__icon">
                <Icon name="pause" size={20} />
              </span>
              <span class="grow">
                <span class="alert-card__title">
                  {plural(waiting.length, 'check is', 'checks are')} waiting to run
                </span>
                <span class="alert-card__text">
                  {questions.length
                    ? 'They need answers from the backend team:'
                    : 'They were skipped or could not run in this environment.'}
                </span>
                {questions.length > 0 && (
                  <span class="qchips">
                    {questions.map((q) => (
                      <span key={q} class="qchip">
                        {q}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <Icon name="chevronRight" size={18} class="faint" />
            </button>
          )}
        </div>
      )}
    </Section>
  );
}
