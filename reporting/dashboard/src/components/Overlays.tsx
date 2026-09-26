/** Dialogs: search palette, keyboard shortcuts, "how to read this report", score explanation. */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatPct, healthScore } from '../../../core/analytics';
import { Icon } from '../icons';
import { plainTitle } from '../plain';
import { NOT_RUN, useApp } from '../store';
import { STATUS_META } from './ui';

/** Accessible modal: focus trap, restores focus on close (Escape is handled globally). */
export function Modal({
  title,
  icon = 'info',
  onClose,
  children,
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => [
      ...(el?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    focusables()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      const first = f[0];
      const last = f[f.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el?.addEventListener('keydown', trap);
    return () => {
      el?.removeEventListener('keydown', trap);
      prev?.focus?.();
    };
  }, []);
  return (
    <>
      <div class="scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        class="modal glass glass--strong"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div class="modal__head">
          <div class="card-title" id="modal-title">
            <Icon name={icon} size={18} />
            {title}
          </div>
          <button class="btn btn--icon btn--ghost" aria-label="Close dialog" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div class="modal__body">{children}</div>
      </div>
    </>
  );
}

interface Item {
  group: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

export function CommandPalette() {
  const { service, setUi, openTest, showTests, setMode, resolvedTheme } = useApp();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      {
        group: 'Quick actions',
        label: 'Show failed tests',
        icon: 'x',
        run: () => showTests({ statuses: ['FAIL'] }),
      },
      {
        group: 'Quick actions',
        label: 'Show tests waiting to run',
        icon: 'pause',
        run: () => showTests({ statuses: NOT_RUN }),
      },
      { group: 'Quick actions', label: 'Show all tests', icon: 'tests', run: () => showTests({}) },
      {
        group: 'Quick actions',
        label: `Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`,
        icon: resolvedTheme === 'dark' ? 'sun' : 'moon',
        run: () => setMode(resolvedTheme === 'dark' ? 'light' : 'dark'),
      },
      {
        group: 'Quick actions',
        label: 'Export…',
        icon: 'download',
        run: () => window.dispatchEvent(new Event('pii:open-export')),
      },
      {
        group: 'Quick actions',
        label: 'How to read this report',
        icon: 'help',
        run: () => setUi({ guide: true }),
      },
    ];
    const tests: Item[] = service.map((t) => ({
      group: 'Tests',
      label: `${plainTitle(t.title)}`,
      hint: `${t.id} · ${STATUS_META[t.status].label}`,
      icon: STATUS_META[t.status].icon,
      run: () => openTest(t.key),
    }));
    return [...actions, ...tests];
  }, [service, resolvedTheme]);

  const results = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return items.filter((i) => i.group !== 'Tests');
    return items
      .filter((i) => tokens.every((t) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(t)))
      .slice(0, 50);
  }, [q, items]);
  useEffect(() => setSel(0), [q]);
  useEffect(
    () => listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }),
    [sel],
  );

  const choose = (i: number) => {
    const item = results[i];
    if (!item) return;
    setUi({ palette: false });
    item.run();
  };
  let lastGroup = '';
  return (
    <>
      <div class="scrim" onClick={() => setUi({ palette: false })} aria-hidden="true" />
      <div class="modal glass glass--strong" role="dialog" aria-modal="true" aria-label="Search">
        <div class="palette__input">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(sel);
              }
            }}
            placeholder="Search tests by name or ID, or pick an action…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={`pal-${sel}`}
          />
          <span class="kbd">Esc</span>
        </div>
        <ul class="palette__list" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <li class="palette__group">No matches for “{q}”</li>}
          {results.map((item, idx) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={`${item.group}-${item.label}-${idx}`} role="presentation">
                {header && <div class="palette__group">{header}</div>}
                <div
                  id={`pal-${idx}`}
                  role="option"
                  aria-selected={idx === sel}
                  class="palette__item"
                  onMouseEnter={() => setSel(idx)}
                  onClick={() => choose(idx)}
                >
                  <Icon name={item.icon} size={16} />
                  <span class="grow ellipsis">{item.label}</span>
                  {item.hint && <span class="xsmall faint nowrap">{item.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

export const SHORTCUTS: [string, string][] = [
  ['⌘/Ctrl K', 'Search everything'],
  ['/', 'Search the test list'],
  ['1 – 4', 'Jump to section 01–04'],
  ['0 or Home', 'Back to the top'],
  ['F · W · A', 'Show Failed · Waiting · All tests'],
  ['← →', 'Previous / next page of tests'],
  ['J / K or ↓ ↑', 'Next / previous test (details open)'],
  ['E', 'Export menu'],
  ['D', 'Dark / light mode'],
  ['Q', 'Fold / unfold the quick-action bar'],
  ['Esc', 'Close'],
  ['?', 'This help'],
];

export function ShortcutsModal() {
  const { setUi } = useApp();
  return (
    <Modal title="Keyboard shortcuts" icon="keyboard" onClose={() => setUi({ shortcuts: false })}>
      <table class="table table--compact">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td class="nowrap">
                <span class="kbd">{k}</span>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function GuideModal() {
  const { setUi, isDemo } = useApp();
  return (
    <Modal title="How to read this report" icon="help" onClose={() => setUi({ guide: false })}>
      <div class="stack">
        {isDemo && (
          <div class="banner banner--warn">
            <Icon name="flask" />
            <div>You are looking at made-up demo data, not a real test run.</div>
          </div>
        )}
        <p>
          This report shows the automated checks of the <b>PII service</b> — the system that stores personal
          data such as emails and phone numbers.
        </p>
        <ol class="guide">
          <li>
            <b>The big sentence at the top</b> tells you the result in one line.
          </li>
          <li>
            <b>The score</b> (0–100%) summarises how healthy the run was. Green numbers are good.
          </li>
          <li>
            <b>What needs attention</b> lists anything that failed or couldn’t run — start there.
          </li>
          <li>
            <b>How each endpoint did</b> has one tile per API endpoint. Click a tile to see its test cases.
          </li>
          <li>
            <b>All tests</b> is the full list, grouped under each endpoint. Click any test for details.
          </li>
        </ol>
        <div class="row row--wrap">
          {(['PASS', 'FAIL', 'BLOCKED'] as const).map((s) => (
            <span key={s} class={`status status--${s}`}>
              <Icon name={STATUS_META[s].icon} size={12} stroke={2.6} /> {STATUS_META[s].label} —{' '}
              {STATUS_META[s].help}
            </span>
          ))}
        </div>
        <p class="small muted">
          The report never contains personal data, passwords, keys or signatures — only test names, results
          and timings.
        </p>
      </div>
    </Modal>
  );
}

export function MethodologyModal() {
  const { setUi, service, report } = useApp();
  const h = healthScore(service, report.endpoints, report.config.health);
  return (
    <Modal title="How the score is calculated" icon="gauge" onClose={() => setUi({ methodology: false })}>
      <div class="stack">
        <p>
          The score combines four things, all measured from this run. It is <b>N/A</b> when no service check
          ran, and it can’t go above {report.config.health.capOnCriticalFailure}% if a security-critical check
          failed.
        </p>
        <table class="table table--compact">
          <thead>
            <tr>
              <th>Part</th>
              <th class="num">Weight</th>
              <th class="num">This run</th>
            </tr>
          </thead>
          <tbody>
            {h.components.map((c) => (
              <tr key={c.key}>
                <td>
                  <b>{c.label}</b>
                  <div class="xsmall muted">{c.explain}</div>
                </td>
                <td class="num">{(c.weight * 100).toFixed(0)}%</td>
                <td class="num">{formatPct(c.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="small muted">
          Result: <b>{h.score === null ? 'N/A' : `${Math.round(h.score)}% — ${h.band}`}</b>
          {h.capped ? ' (capped because a critical check failed)' : ''}. Bands:{' '}
          {report.config.health.bands.map((b) => `${b.label} ≥ ${b.min}`).join(' · ')}.
        </p>
      </div>
    </Modal>
  );
}
