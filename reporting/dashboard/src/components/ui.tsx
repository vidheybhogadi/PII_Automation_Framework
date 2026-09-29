/** Small design-system kit: status badges, sections, SVG score + rings, tooltips, copy buttons, empty states. */
import { Component, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { maskRequestId, sanitizeText } from '../../../core/sanitize';
import type { Outcome } from '../../../core/analytics';
import type { TestStatus } from '../../../core/types';
import { GLOSSARY } from '../glossary';
import { useCountUp, useInView } from '../hooks';
import { Icon } from '../icons';
import { useApp } from '../store';
import { copyText } from '../utils';

// ---- Status: never colour alone — always icon + word --------------------------------------------------
export const STATUS_META: Record<TestStatus, { label: string; icon: string; help: string }> = {
  PASS: { label: 'Pass', icon: 'check', help: 'The check ran and everything was as expected.' },
  FAIL: { label: 'Fail', icon: 'x', help: 'The check ran and something was not as expected.' },
  SKIPPED: { label: 'Skipped', icon: 'skip', help: GLOSSARY.Skipped as string },
  BLOCKED: { label: 'Blocked', icon: 'pause', help: GLOSSARY.Blocked as string },
  FIXME: { label: 'Blocked', icon: 'pause', help: GLOSSARY.Fixme as string },
  UNKNOWN: { label: 'Not run', icon: 'minus', help: 'No result was recorded (the run stopped early).' },
};

/**
 * The statuses a reader sees (see OUTCOMES in core/analytics for the order). Icon + word + help text, never
 * colour alone. `cls` is the badge's CSS modifier (.outcome--…), `token` the row's data-status value.
 */
export const OUTCOME_META: Record<Outcome, { cls: string; token: string; icon: string; help: string }> = {
  Pass: { cls: 'pass', token: 'PASS', icon: 'check', help: 'The test ran and everything was as expected.' },
  Fail: {
    cls: 'fail',
    token: 'FAIL',
    icon: 'x',
    help: 'The test ran and something was not as expected (an automation failure to investigate).',
  },
  'Security finding': {
    cls: 'finding',
    token: 'FINDING',
    icon: 'shield',
    help: 'The test ran and failed on a known, reported security issue. Expected to fail until Dev fixes it — still counted as a failure.',
  },
  Blocked: {
    cls: 'blocked',
    token: 'BLOCKED',
    icon: 'pause',
    help: 'The test cannot run until Dev answers a question or grants access (see the BQ reference). Neither a pass nor a failure.',
  },
  Skipped: {
    cls: 'skipped',
    token: 'SKIPPED',
    icon: 'skip',
    help: 'The test was skipped in this run — see the reason (e.g. optional setup not configured).',
  },
  'Not Tested': {
    cls: 'not-tested',
    token: 'NOT_TESTED',
    icon: 'minus',
    help: 'The test did not run: not part of this run, the run stopped early, or the Aisle PII facade could not be reached.',
  },
};

export function OutcomeBadge({ outcome, large }: { outcome: Outcome; large?: boolean }) {
  const m = OUTCOME_META[outcome];
  return (
    <span
      class={`status outcome--${m.cls}${large ? ' status--lg' : ''}`}
      data-help={m.help}
      data-help-title={outcome}
    >
      <Icon name={m.icon} size={large ? 15 : 12} stroke={2.6} />
      {outcome}
    </span>
  );
}

export function Method({ method }: { method: string }) {
  return <span class={`method method--${method}`}>{method}</span>;
}

export function Section({
  id,
  num,
  eyebrow,
  title,
  sub,
  aside,
  children,
}: {
  id: string;
  /** "01", "02"… — gives the page a clear reading order. */
  num?: string;
  eyebrow?: string;
  title: string;
  sub?: string;
  aside?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="section" id={id} aria-labelledby={`${id}-title`}>
      <header class="section-head">
        <div class="section-head__text">
          {(num || eyebrow) && (
            <div class="eyebrow">
              {num && <span class="eyebrow__num">{num}</span>}
              {eyebrow}
            </div>
          )}
          <h2 class="section-title" id={`${id}-title`}>
            {title}
          </h2>
          {sub && <p class="section-desc">{sub}</p>}
        </div>
        {aside && <div class="section-head__aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({
  icon = 'check',
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ComponentChildren;
}) {
  return (
    <div class="empty glass" role="status">
      <div class="empty__icon">
        <Icon name={icon} size={26} />
      </div>
      <div class="empty__title">{title}</div>
      {children && <div class="small muted">{children}</div>}
    </div>
  );
}

// ---- Score ring + area rings (pure SVG — no chart library) ---------------------------------------------
export type Tone = 'pass' | 'warn' | 'fail' | 'muted';

/** Colour of a 0–100 score: green from 85, amber from 60, red below. */
export const scoreTone = (v: number | null): Tone =>
  v === null ? 'muted' : v >= 85 ? 'pass' : v >= 60 ? 'warn' : 'fail';

/**
 * Speedometer for a 0–100% score: 240° gradient arc over red / amber / green zones, tick marks, and a needle that
 * sweeps to the value. `value` is 0–100 or null (shown as N/A, no needle).
 */
export function Gauge({ value, label, sub }: { value: number | null; label: string; sub?: string }) {
  const isPrint = document.documentElement.dataset.print === 'true';
  const [ref, inView] = useInView<HTMLDivElement>(isPrint);
  const shown = useCountUp(value ?? 0, inView, 1300);
  const tone = scoreTone(value);
  const W = 260;
  const c = 130; // centre x/y
  const r = 100; // value arc radius
  const start = 150; // degrees; 0 = 3 o'clock, clockwise
  const sweep = 240;
  const pt = (deg: number, radius: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [c + radius * Math.cos(a), c + radius * Math.sin(a)];
  };
  const arc = (from: number, to: number, radius: number) => {
    const [x1, y1] = pt(from, radius);
    const [x2, y2] = pt(to, radius);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const at = (pct: number) => start + (sweep * pct) / 100;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, shown));
  const [nx, ny] = pt(at(pct), r - 30);
  const zones: [number, number, Tone][] = [
    [0, 60, 'fail'],
    [60, 85, 'warn'],
    [85, 100, 'pass'],
  ];
  return (
    <div
      ref={ref}
      class={`gauge gauge--${tone}`}
      role="img"
      aria-label={
        value === null
          ? `${label} not available`
          : `${label} ${Math.round(value)}% out of 100%${sub ? `, ${sub}` : ''}`
      }
    >
      <svg viewBox={`0 -18 ${W} 226`} width="100%" aria-hidden="true">
        <defs>
          <linearGradient id={`gauge-grad-${tone}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" class="gauge__stop1" />
            <stop offset="1" class="gauge__stop2" />
          </linearGradient>
          <filter id="gauge-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {/* zones: red below 60%, amber 60–85%, green from 85% */}
        {zones.map(([from, to, z]) => (
          <path key={z} d={arc(at(from) + 1, at(to) - 1, r + 18)} class={`gauge__zone gauge__zone--${z}`} />
        ))}
        <path d={arc(start, start + sweep, r)} class="gauge__track" />
        {value !== null && pct > 0.5 && (
          <>
            <path
              d={arc(start, at(pct), r)}
              stroke={`url(#gauge-grad-${tone})`}
              class="gauge__glow"
              filter="url(#gauge-glow)"
            />
            <path d={arc(start, at(pct), r)} stroke={`url(#gauge-grad-${tone})`} class="gauge__value" />
          </>
        )}
        {Array.from({ length: 21 }, (_, i) => {
          const major = i % 5 === 0;
          const [x1, y1] = pt(at(i * 5), r - 16);
          const [x2, y2] = pt(at(i * 5), r - (major ? 25 : 21));
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              class={`gauge__tick${major ? ' gauge__tick--major' : ''}`}
            />
          );
        })}
        {[0, 50, 100].map((v) => {
          const [x, y] = pt(at(v), r + 36);
          return (
            <text key={v} x={x} y={y + 4} class="gauge__scale" text-anchor="middle">
              {v}%
            </text>
          );
        })}
        {value !== null && (
          <>
            <line x1={c} y1={c} x2={nx} y2={ny} class="gauge__needle" />
            <circle cx={c} cy={c} r="9" class="gauge__hub" />
            <circle cx={c} cy={c} r="3.5" class="gauge__hub-dot" />
          </>
        )}
      </svg>
      <div class="gauge__label">
        <div class="gauge__num">
          {value === null ? 'N/A' : `${Math.round(shown)}%`}
          {value !== null && <span class="gauge__of">/100%</span>}
        </div>
        <div class="gauge__sub">{sub ?? label}</div>
      </div>
    </div>
  );
}

/** Small ring for area cards; draws in when scrolled into view. */
export function Ring({
  value,
  size = 56,
  tone = 'pass',
}: {
  value: number | null;
  size?: number;
  tone?: Tone;
}) {
  const [ref, inView] = useInView<SVGSVGElement>(document.documentElement.dataset.print === 'true');
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = inView ? (value ?? 0) : 0;
  return (
    <svg ref={ref} class="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} class="ring__track" stroke-width={stroke} fill="none" />
      {value !== null && value > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke-width={stroke}
          class={`ring__value ring__value--${tone}`}
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - shown)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

export function KV({ items }: { items: [ComponentChildren, ComponentChildren][] }) {
  return (
    <div class="kv">
      {items.map(([k, v], i) => (
        <div class="kv__item" key={i}>
          <div class="kv__k">{k}</div>
          <div class="kv__v">{v ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Help & tooltips ------------------------------------------------------------------------------------
export function Term({ term, children }: { term: string; children?: ComponentChildren }) {
  const text = GLOSSARY[term];
  if (!text) return <>{children ?? term}</>;
  return (
    <span class="term" tabIndex={0} data-help={text} data-help-title={term} aria-label={`${term}: ${text}`}>
      {children ?? term}
    </span>
  );
}

/** One global tooltip driven by data-help attributes. */
export function TipLayer() {
  const [tip, setTip] = useState<{
    title: string;
    text: string;
    x: number;
    y: number;
    above: boolean;
  } | null>(null);
  useEffect(() => {
    const show = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-help]') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const above = r.bottom + 140 > window.innerHeight;
      setTip({
        title: el.dataset.helpTitle ?? '',
        text: el.dataset.help ?? '',
        x: Math.min(window.innerWidth - 336, Math.max(8, r.left + r.width / 2 - 160)),
        y: above ? r.top - 8 : r.bottom + 8,
        above,
      });
    };
    const hide = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-help]')) setTip(null);
    };
    const onScroll = () => setTip(null);
    document.addEventListener('pointerover', show);
    document.addEventListener('pointerout', hide);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('pointerover', show);
      document.removeEventListener('pointerout', hide);
      document.removeEventListener('focusin', show);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  if (!tip) return null;
  return (
    <div
      class="tip"
      role="tooltip"
      style={{
        left: `${tip.x}px`,
        top: `${tip.y}px`,
        transform: tip.above ? 'translateY(-100%)' : undefined,
      }}
    >
      {tip.title && <b>{tip.title}</b>}
      {tip.text}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const { toast } = useApp();
  return (
    <button
      class="btn btn--icon btn--ghost btn--sm no-print"
      aria-label={label}
      title={label}
      onClick={async (e) => {
        e.stopPropagation();
        toast((await copyText(text)) ? 'Copied to clipboard' : 'Copy failed — clipboard unavailable');
      }}
    >
      <Icon name="copy" size={14} />
    </button>
  );
}

export function RequestId({ id }: { id?: string }) {
  if (!id) return <span class="faint">—</span>;
  return (
    <span class="row" style={{ gap: 4 }}>
      <code
        data-help="A random tracking number for this request (no personal data). Give it to backend engineers to find the matching server log."
        data-help-title="Request ID"
      >
        {maskRequestId(id)}
      </code>
      <CopyButton text={id} label="Copy full request ID" />
    </span>
  );
}

/** Keeps one broken block from taking down the whole report. */
export class Boundary extends Component<
  { name: string; children: ComponentChildren },
  { error: string | null }
> {
  override state = { error: null as string | null };
  override componentDidCatch(error: Error) {
    this.setState({ error: sanitizeText(error.message, 300) });
  }
  override render() {
    if (this.state.error) {
      return (
        <div class="banner banner--warn" role="alert">
          <Icon name="alert" />
          <div>
            <b>“{this.props.name}” could not be shown.</b> The rest of the report is unaffected. (
            {this.state.error})
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
