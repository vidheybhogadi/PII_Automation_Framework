/** Test details — plain language first, technical detail below. Only sanitized metadata is ever shown. */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import {
  analyzeFailure,
  FAILURE_PATTERNS,
  formatDuration,
  NOT_APPLICABLE_ANNOTATION,
  testOutcome,
} from '../../../core/analytics';
import { suiteOf } from '../../../core/catalog';
import { sanitizeText } from '../../../core/sanitize';
import { Icon } from '../icons';
import { endpointOf, plainEndpoint, plainTitle } from '../plain';
import { useApp } from '../store';
import { copyText, fmtDateTime, isTypingTarget } from '../utils';
import { CopyButton, KV, Method, OutcomeBadge, RequestId } from './ui';
import type { ApiExchange } from '../../../core/types';

const IMPORTANCE: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function TestDrawer() {
  const { report, ui, byKey, list, openTest, setUi, toast } = useApp();
  const test = ui.drawer ? byKey.get(ui.drawer) : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const idx = useMemo(() => (test ? list.findIndex((t) => t.key === test.key) : -1), [test, list]);
  // The key listener reads the current test through this ref, so a fast J/K right after opening or
  // moving never acts on the previous position.
  const current = useRef({ key: test?.key, list });
  current.current = { key: test?.key, list };
  const go = (d: number) => {
    const { key, list: rows } = current.current;
    const i = rows.findIndex((t) => t.key === key);
    const next = i < 0 ? undefined : rows[i + d];
    if (next) {
      current.current = { key: next.key, list: rows };
      openTest(next.key);
    }
  };

  // Focus handling runs when the panel opens and closes.
  const open = Boolean(test);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => prev?.focus?.();
  }, [open]);

  // Layout effect: the listener is live as soon as the panel renders, so an immediate J/K is not lost.
  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (['ArrowDown', 'j', ']'].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (['ArrowUp', 'k', '['].includes(e.key)) {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!test) return null;
  const failure = test.status === 'FAIL' ? analyzeFailure(test) : null;
  const preflight = test.annotations.find((a) => a.type === 'preflight');
  const waiting = test.annotations.filter((a) => ['blocked', 'fixme', 'skip'].includes(a.type));
  const ep = plainEndpoint(endpointOf(test), report.endpoints);
  const calls = test.apiCalls.filter((c) => c.phase !== 'preflight');
  // The response the test judged: the last call made in the "test" phase that has a captured exchange.
  const actualCall = [...calls].reverse().find((c) => (c.phase ?? 'test') === 'test' && c.exchange);
  const outcome = testOutcome(test);
  const info = test.info;
  const notApplicable =
    outcome.outcome === 'Not Applicable'
      ? test.annotations.filter((a) => a.type === NOT_APPLICABLE_ANNOTATION && a.description)
      : [];

  return (
    <>
      <div class="scrim" onClick={() => setUi({ drawer: null })} aria-hidden="true" />
      <aside
        ref={ref}
        class="drawer glass glass--strong"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <div class="drawer__head">
          <div class="row row--between">
            <OutcomeBadge outcome={outcome.outcome} large />
            <div class="row" style={{ gap: 4 }}>
              <button
                class="btn btn--icon btn--ghost"
                aria-label="Previous test"
                title="Previous test (K or ↑)"
                disabled={idx <= 0}
                onClick={() => go(-1)}
              >
                <Icon name="chevronLeft" />
              </button>
              <button
                class="btn btn--icon btn--ghost"
                aria-label="Next test"
                title="Next test (J or ↓)"
                disabled={idx < 0 || idx >= list.length - 1}
                onClick={() => go(1)}
              >
                <Icon name="chevronRight" />
              </button>
              <button
                class="btn btn--icon btn--ghost"
                aria-label="Copy link to this test"
                onClick={async () => toast((await copyText(location.href)) ? 'Link copied' : 'Copy failed')}
              >
                <Icon name="link" />
              </button>
              <button
                class="btn btn--icon btn--ghost"
                aria-label="Close"
                data-autofocus
                onClick={() => setUi({ drawer: null })}
              >
                <Icon name="x" />
              </button>
            </div>
          </div>
          <h3 id="drawer-title" class="drawer__title">
            {plainTitle(test.title)}
          </h3>
          <div class="row row--wrap" style={{ gap: 6 }}>
            <span class="tag">
              <Icon name={ep.icon} size={12} /> {ep.name}
            </span>
            {ep.method && <span class={`method method--${ep.method}`}>{ep.method}</span>}
            <span class="tag tag--mono">{ep.path}</span>
            <span class="tag tag--mono">{test.id}</span>
          </div>
        </div>

        <div class="drawer__body">
          <section class="about-test" aria-label="About this test">
            {info ? (
              <>
                <div class="about-test__block">
                  <div class="subhead">What this test does</div>
                  <p>{info.what}</p>
                </div>
                <div class="about-test__block about-test__block--why">
                  <div class="subhead">Why it matters</div>
                  <p>{info.why}</p>
                </div>
                <div class="about-test__block">
                  <div class="subhead">Steps</div>
                  <ol class="about-test__steps">
                    {info.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
                {info.request && (
                  <div class="about-test__block">
                    <div class="subhead">Request</div>
                    <pre class="about-test__request">
                      <code>{info.request}</code>
                    </pre>
                  </div>
                )}
                <div class="about-test__block about-test__block--expected">
                  <div class="subhead">Expected result</div>
                  <p>{info.expected}</p>
                </div>
                {info.validation && info.validation.length > 0 && (
                  <div class="about-test__block">
                    <div class="subhead">Validation (what is checked)</div>
                    <ul class="about-test__checks">
                      {info.validation.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div class="about-test__chips">
                  <span class="tag">{info.type}</span>
                  <span class={`suite suite--${suiteOf(test.tags)}`}>{suiteOf(test.tags)}</span>
                  <span class={`prio prio--${info.priority}`}>{info.priority} priority</span>
                </div>
                {info.preconditions && (
                  <div class="about-test__pre">
                    <Icon name="info" size={16} />
                    <span>
                      <b>Needs: </b>
                      {info.preconditions}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p class="muted small">No description has been written for this test yet (tests/catalog).</p>
            )}
          </section>

          <section class={`result-box result-box--${outcome.outcome.replace(' ', '-')}`} aria-label="Result">
            <div class="subhead">Result of this run</div>
            <div class="row row--wrap" style={{ gap: 10 }}>
              <OutcomeBadge outcome={outcome.outcome} />
              <span class="small">
                {outcome.outcome === 'Pass' ? 'Everything was as expected.' : outcome.remark}
              </span>
            </div>
          </section>

          {outcome.outcome === 'Security finding' && (
            <div class="banner banner--finding">
              <Icon name="shield" />
              <div>
                <b>Known security finding — expected to fail until Dev fixes it.</b>
                <div class="small">
                  Reported to Dev; still counted as a failure. It is listed separately from automation
                  failures.
                </div>
              </div>
            </div>
          )}

          {notApplicable.length > 0 && (
            <div class="banner banner--na">
              <Icon name="ban" />
              <div>
                <b>Not applicable — Dev confirmed this feature is intentionally not supported.</b>
                <ul>
                  {notApplicable.map((a, i) => (
                    <li key={i}>{a.description}</li>
                  ))}
                </ul>
                <div class="small">Neither a pass nor a failure; not counted in the pass rate or gates.</div>
              </div>
            </div>
          )}

          {preflight && (
            <div class="banner banner--fail">
              <Icon name="server" />
              <div>
                <b>This check could not run — the Aisle PII facade was not reachable.</b>
                <div class="small">{preflight.description}</div>
              </div>
            </div>
          )}

          {failure && !preflight && (
            <section class="stack" aria-label="What went wrong">
              <div class="subhead">What went wrong</div>
              <div class="diff">
                <div class="diff__box diff__box--exp">
                  <div class="xsmall muted">Expected</div>
                  <code>{failure.expected ?? 'see error below'}</code>
                </div>
                <div class="diff__box diff__box--rec">
                  <div class="xsmall muted">Got</div>
                  <code>{failure.received ?? FAILURE_PATTERNS[failure.pattern].label}</code>
                </div>
              </div>
              <div class="glass glass--soft glass--pad">
                <div class="subhead">Where to look first</div>
                <ul class="checklist">
                  {FAILURE_PATTERNS[failure.pattern].investigate.map((i) => (
                    <li key={i}>
                      <Icon name="chevronRight" size={16} /> {i}
                    </li>
                  ))}
                </ul>
                <div class="xsmall muted" style={{ marginTop: 8 }}>
                  Suggestions based on the kind of failure — a starting point, not a diagnosis.
                </div>
              </div>
              {failure.requestId && (
                <div class="small row">
                  Request ID for backend logs: <RequestId id={failure.requestId} />
                </div>
              )}
            </section>
          )}

          {waiting.length > 0 && !test.notRun && outcome.outcome !== 'Not Applicable' && (
            <div class="banner banner--warn">
              <Icon name="pause" />
              <div>
                <b>
                  {outcome.outcome === 'Blocked'
                    ? 'Why this test is blocked'
                    : outcome.outcome === 'Skipped'
                      ? 'Why this test was skipped'
                      : 'Why this test was not tested'}
                </b>
                <ul>
                  {waiting
                    .filter((a) => a.description)
                    .map((a, i) => (
                      <li key={i}>{a.description}</li>
                    ))}
                </ul>
              </div>
            </div>
          )}

          {(outcome.outcome === 'Fail' || outcome.outcome === 'Security finding') && actualCall?.exchange && (
            <section class="stack" aria-label="Expected and actual response">
              <div class="subhead">Expected vs actual response</div>
              <div class="diff diff--stack">
                <div class="diff__box diff__box--exp">
                  <div class="xsmall muted">Expected</div>
                  <div class="small">{info?.expected ?? 'See the failure message above.'}</div>
                </div>
                <div class="diff__box diff__box--got">
                  <div class="xsmall muted">
                    Actual — {actualCall.method} {actualCall.path} → HTTP {actualCall.status ?? 'no reply'}
                    {actualCall.exchange.responseContentType
                      ? ` (${actualCall.exchange.responseContentType})`
                      : ''}
                  </div>
                  <pre class="exchange__body">{prettyBody(actualCall.exchange.responseBody)}</pre>
                </div>
              </div>
            </section>
          )}

          <section aria-label="Details">
            <div class="subhead">Details</div>
            <KV
              items={[
                ['Endpoint', `${ep.name} — ${ep.means}`],
                ['Priority', info?.priority ?? IMPORTANCE[test.severity] ?? test.severity],
                [
                  'Duration',
                  test.status === 'PASS' || test.status === 'FAIL' ? formatDuration(test.durationMs) : '—',
                ],
                ['Started', fmtDateTime(test.startedAt)],
                ['Retries', String(test.retries)],
                ['Source', <code>{`${test.file}:${test.line}`}</code>],
              ]}
            />
          </section>

          {calls.length > 0 && (
            <section aria-label="Requests made">
              <div class="subhead">Requests made ({calls.length})</div>
              <ul class="calls">
                {calls.map((c, i) => (
                  <li key={i} class="call">
                    <Method method={c.method} />
                    <code class="call__path ellipsis">{c.path}</code>
                    {c.phase && c.phase !== 'test' && (
                      <span
                        class="tag"
                        title={c.phase === 'setup' ? 'Preparing test data' : 'Follow-up check'}
                      >
                        {c.phase === 'setup' ? 'prep' : 'check'}
                      </span>
                    )}
                    <span
                      class={`status ${c.status === null || c.status >= 500 ? 'status--FAIL' : c.status >= 400 ? 'status--BLOCKED' : 'status--PASS'}`}
                    >
                      {c.status ?? 'no reply'}
                      {c.errorCode ? ` ${c.errorCode}` : ''}
                    </span>
                    <span class="xsmall muted tabular nowrap">
                      {c.status === null ? '' : `${Math.round(c.durationMs)} ms`}
                    </span>
                    <RequestId id={c.requestId} />
                    {c.exchange && <ExchangeDetails exchange={c.exchange} status={c.status} />}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {test.steps.length > 0 && (
            <section aria-label="Execution log">
              <div class="subhead">What happened (execution log)</div>
              <ol class="checklist">
                {test.steps.map((s, i) => (
                  <li key={i}>
                    <Icon name={s.failed ? 'x' : 'check'} size={16} />
                    <span class="grow">{s.title}</span>
                    <span class="xsmall faint tabular">{formatDuration(s.durationMs)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {test.errors.length > 0 && (
            <details class="raw">
              <summary>Technical error message</summary>
              {test.errors.map((e, i) => (
                <div key={i} class="codebox">
                  {sanitizeText(e.message)}
                </div>
              ))}
            </details>
          )}

          <p class="xsmall faint">
            <Icon name="eyeOff" size={12} /> Requests and responses are shown in full — all test data is fake.
            The Aisle token is never recorded: it appears as <code>$AISLE_TEST_TOKEN</code>.
          </p>
        </div>
      </aside>
    </>
  );
}

/** Pretty-print JSON bodies; anything else is shown as received. */
function prettyBody(body: string | null): string {
  if (body === null) return '(no body)';
  if (body.trim() === '') return '(empty body)';
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

/** One request: copy-paste curl (token as $AISLE_TEST_TOKEN), the request body and the exact response. */
function ExchangeDetails({ exchange, status }: { exchange: ApiExchange; status: number | null }) {
  return (
    <details class="exchange">
      <summary>Request (curl) and response</summary>
      <div class="exchange__part">
        <div class="row row--between">
          <span class="xsmall muted">Request — copy and run (uses $AISLE_TEST_TOKEN from your .env)</span>
          <CopyButton text={exchange.curl} label="Copy curl" />
        </div>
        <pre class="exchange__body">{exchange.curl}</pre>
        {exchange.requestBody !== null && (
          <>
            <div class="xsmall muted">Request body{exchange.requestBodyTruncated ? ' (shortened)' : ''}</div>
            <pre class="exchange__body">{prettyBody(exchange.requestBody)}</pre>
          </>
        )}
      </div>
      <div class="exchange__part">
        <div class="row row--between">
          <span class="xsmall muted">
            Response — HTTP {status ?? 'no reply'}
            {exchange.responseContentType ? ` · ${exchange.responseContentType}` : ''}
            {exchange.responseBodyTruncated ? ' (shortened)' : ''}
          </span>
          {exchange.responseBody ? <CopyButton text={exchange.responseBody} label="Copy response" /> : null}
        </div>
        <pre class="exchange__body">{prettyBody(exchange.responseBody)}</pre>
      </div>
    </details>
  );
}
