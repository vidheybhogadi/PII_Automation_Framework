/** Test details — plain language first, technical detail below. Only sanitized metadata is ever shown. */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { analyzeFailure, FAILURE_PATTERNS, formatDuration } from '../../../core/analytics';
import { sanitizeText } from '../../../core/sanitize';
import { Icon } from '../icons';
import { endpointOf, plainEndpoint, plainTitle } from '../plain';
import { useApp } from '../store';
import { copyText, fmtDateTime, isTypingTarget } from '../utils';
import { KV, Method, RequestId, StatusBadge } from './ui';

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
            <StatusBadge status={test.status} large />
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
          {preflight && (
            <div class="banner banner--fail">
              <Icon name="server" />
              <div>
                <b>This check could not run — the PII service was not reachable.</b>
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

          {waiting.length > 0 && (
            <div class="banner banner--warn">
              <Icon name="pause" />
              <div>
                <b>Why this check didn’t run</b>
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

          <section aria-label="Details">
            <div class="subhead">Details</div>
            <KV
              items={[
                ['Endpoint', `${ep.name} — ${ep.means}`],
                ['Importance', IMPORTANCE[test.severity] ?? test.severity],
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
                  </li>
                ))}
              </ul>
            </section>
          )}

          {test.steps.length > 0 && (
            <section aria-label="Steps">
              <div class="subhead">Steps</div>
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
            <Icon name="eyeOff" size={12} /> Request and response contents, keys and signatures are never
            recorded.
          </p>
        </div>
      </aside>
    </>
  );
}
