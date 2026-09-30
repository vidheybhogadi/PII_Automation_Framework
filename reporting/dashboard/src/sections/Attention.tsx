/**
 * "What needs attention" — automation failures first, then known security findings, then blocked tests (grouped by
 * blocker, e.g. BQ-01), then what was skipped / not tested and why, then a small "Not applicable" card (features
 * Dev confirmed are unsupported, grouped by BQ answer). Plain language, click for details.
 */
import { useMemo, useState } from 'preact/hooks';
import {
  analyzeFailure,
  FAILURE_PATTERNS,
  NOT_APPLICABLE_ANNOTATION,
  preflightFailures,
  questionIdOf,
  SECURITY_FINDING_ANNOTATION,
  SEVERITY_RANK,
  testOutcome,
} from '../../../core/analytics';
import { EmptyState, Section } from '../components/ui';
import { Icon } from '../icons';
import { endpointOf, plainEndpoint, plainTitle } from '../plain';
import { NOT_RUN, OUTCOME_FILTER, outcomeOf, useApp } from '../store';
import { plural } from '../utils';

export function Attention() {
  const { report, service, all, openTest, showTests } = useApp();
  const [showAll, setShowAll] = useState(false);
  const preflight = useMemo(() => preflightFailures(service), [service]);
  // Automation failures only; known security findings get their own card.
  const failures = useMemo(
    () =>
      service
        .filter((t) => outcomeOf(t) === 'Fail' && !preflight.includes(t))
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
        .map(analyzeFailure),
    [service, preflight],
  );
  const findings = useMemo(
    () =>
      service
        .filter((t) => outcomeOf(t) === 'Security finding')
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id)),
    [service],
  );
  // Blocked tests grouped by their blocker (BQ-xx / Q-xx), with the blocker's description.
  const blockers = useMemo(() => {
    const groups = new Map<string, { why: string; tests: string[] }>();
    for (const t of all) {
      if (outcomeOf(t) !== 'Blocked') continue;
      const id = questionIdOf(t) ?? 'Other';
      const why =
        t.annotations.find((a) => a.type === 'blocked')?.description ??
        testOutcome(t).remark.replace(/^BLOCKED — /, '');
      const g = groups.get(id) ?? { why: why.replace(/^B?Q-\d+:\s*/, ''), tests: [] };
      g.tests.push(t.id);
      groups.set(id, g);
    }
    return [...groups.entries()].sort(([a], [b]) =>
      a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [all]);
  const blockedCount = blockers.reduce((n, [, g]) => n + g.tests.length, 0);
  // Not Applicable: Dev confirmed the feature is intentionally unsupported — grouped by the BQ answer.
  const notApplicable = useMemo(() => {
    const groups = new Map<string, { why: string; tests: string[] }>();
    for (const t of all) {
      if (outcomeOf(t) !== 'Not Applicable') continue;
      const id = questionIdOf(t, NOT_APPLICABLE_ANNOTATION) ?? 'Other';
      const why =
        t.annotations.find((a) => a.type === NOT_APPLICABLE_ANNOTATION)?.description ??
        testOutcome(t).remark.replace(/^NOT APPLICABLE — /, '');
      const g = groups.get(id) ?? { why: why.replace(/^B?Q-\d+:\s*/, ''), tests: [] };
      g.tests.push(t.id);
      groups.set(id, g);
    }
    return [...groups.entries()].sort(([a], [b]) =>
      a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [all]);
  const naCount = notApplicable.reduce((n, [, g]) => n + g.tests.length, 0);
  const naCard = naCount > 0 && (
    <button
      class="alert-card alert-card--na alert-card--wide glass glass--interactive"
      onClick={() => showTests({ statuses: [OUTCOME_FILTER['Not Applicable']] })}
    >
      <span class="alert-card__icon">
        <Icon name="ban" size={20} />
      </span>
      <span class="grow">
        <span class="alert-card__title">
          {plural(naCount, 'test is', 'tests are')} not applicable — feature confirmed unsupported by Dev
        </span>
        <span class="alert-card__text">
          Nothing to fix: not a pass or a failure, and not counted in the pass rate or quality gates.
        </span>
        <span class="reason-list">
          {notApplicable.map(([id, g]) => (
            <span key={id} class="reason" title={g.tests.join(', ')}>
              <b>{id}</b> {g.why} <span class="faint">({plural(g.tests.length, 'test')})</span>
            </span>
          ))}
        </span>
      </span>
      <Icon name="chevronRight" size={18} class="faint" />
    </button>
  );
  // Skipped / Not Tested = the rest that did not run (the unreachable-facade case has its own card).
  const waiting = useMemo(
    () =>
      all.filter(
        (t) => (outcomeOf(t) === 'Not Tested' || outcomeOf(t) === 'Skipped') && !preflight.includes(t),
      ),
    [all, preflight],
  );
  const reasons = useMemo(() => {
    const notInRun = waiting.filter((t) => t.notRun).length;
    const skipped = waiting.filter((t) => outcomeOf(t) === 'Skipped').length;
    const other = waiting.length - notInRun - skipped;
    return [
      [notInRun, 'not part of this run'],
      [skipped, 'skipped — need extra setup or configuration'],
      [other, 'stopped before running'],
    ].filter(([n]) => (n as number) > 0) as [number, string][];
  }, [waiting]);
  const shown = showAll ? failures : failures.slice(0, 6);
  const nothing =
    failures.length === 0 &&
    findings.length === 0 &&
    blockedCount === 0 &&
    waiting.length === 0 &&
    preflight.length === 0;

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
            {findings.length > 0 && (
              <span class="count-pill__item count-pill__item--finding">
                {plural(findings.length, 'security finding')}
              </span>
            )}
            {blockedCount > 0 && (
              <span class="count-pill__item count-pill__item--warn">{blockedCount} blocked</span>
            )}
            {waiting.length > 0 && (
              <span class="count-pill__item count-pill__item--muted">{waiting.length} not tested</span>
            )}
            {naCount > 0 && (
              <span class="count-pill__item count-pill__item--na">{naCount} not applicable</span>
            )}
          </span>
        )
      }
    >
      {nothing ? (
        <>
          <EmptyState icon="check" title="Nothing needs attention">
            {service.some((t) => t.status === 'PASS')
              ? 'Every check that ran passed.'
              : 'No checks ran in this report.'}
          </EmptyState>
          {naCard && <div class="attention">{naCard}</div>}
        </>
      ) : (
        <div class="attention">
          {preflight.length > 0 && (
            <div class="alert-card alert-card--fail alert-card--wide glass">
              <span class="alert-card__icon">
                <Icon name="server" size={22} />
              </span>
              <div class="grow">
                <div class="alert-card__title">The Aisle PII facade could not be reached</div>
                <div class="alert-card__text">
                  {plural(preflight.length, 'check')} could not run. This is an environment problem (address,
                  token, network/VPN or the service being down) — not a problem with the individual checks.
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

          {findings.length > 0 && (
            <div class="alert-card alert-card--finding alert-card--wide glass">
              <span class="alert-card__icon">
                <Icon name="shield" size={20} />
              </span>
              <div class="grow">
                <div class="alert-card__title">
                  {plural(findings.length, 'security finding')} — expected to fail until Dev fixes{' '}
                  {findings.length === 1 ? 'it' : 'them'}
                </div>
                <div class="alert-card__text">
                  Known, reported security issues. They still count as failures, but are not automation
                  problems.
                </div>
                <ul class="finding-list">
                  {findings.map((t) => (
                    <li key={t.key}>
                      <button class="finding-item" onClick={() => openTest(t.key)}>
                        <span class="mono">{t.id}</span>
                        <span class="grow">
                          {t.annotations.find((a) => a.type === SECURITY_FINDING_ANNOTATION)?.description ??
                            plainTitle(t.title)}
                        </span>
                        <Icon name="chevronRight" size={14} class="faint" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {blockedCount > 0 && (
            <button
              class="alert-card alert-card--warn alert-card--wide glass glass--interactive"
              onClick={() => showTests({ statuses: [OUTCOME_FILTER.Blocked] })}
            >
              <span class="alert-card__icon">
                <Icon name="pause" size={20} />
              </span>
              <span class="grow">
                <span class="alert-card__title">
                  {plural(blockedCount, 'test is', 'tests are')} blocked — waiting on Dev
                </span>
                <span class="alert-card__text">Not a pass and not a failure. Blockers:</span>
                <span class="reason-list">
                  {blockers.map(([id, g]) => (
                    <span key={id} class="reason" title={g.tests.join(', ')}>
                      <b>{id}</b> {g.why} <span class="faint">({plural(g.tests.length, 'test')})</span>
                    </span>
                  ))}
                </span>
              </span>
              <Icon name="chevronRight" size={18} class="faint" />
            </button>
          )}

          {waiting.length > 0 && (
            <button
              class="alert-card alert-card--muted alert-card--wide glass glass--interactive"
              onClick={() =>
                showTests({
                  statuses: waiting.some((t) => outcomeOf(t) === 'Not Tested')
                    ? [...NOT_RUN, OUTCOME_FILTER.Skipped]
                    : [OUTCOME_FILTER.Skipped],
                })
              }
            >
              <span class="alert-card__icon">
                <Icon name="minus" size={20} />
              </span>
              <span class="grow">
                <span class="alert-card__title">
                  {plural(waiting.length, 'test was', 'tests were')} not tested
                </span>
                <span class="alert-card__text">Why:</span>
                <span class="reason-list">
                  {reasons.map(([n, why]) => (
                    <span key={why} class="reason">
                      <b>{n}</b> {why}
                    </span>
                  ))}
                </span>
              </span>
              <Icon name="chevronRight" size={18} class="faint" />
            </button>
          )}

          {naCard}
        </div>
      )}
    </Section>
  );
}
