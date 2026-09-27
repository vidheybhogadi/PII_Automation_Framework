/** Page chrome: background, top bar (search · theme · export), floating dock, toasts. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { chatSummary, resultsJson, testsToCsv } from '../../../core/exporters';
import { useScrolledPast } from '../hooks';
import { Icon, Logo } from '../icons';
import { ACCENTS, useApp, type Accent, type ThemeMode } from '../store';
import { copyText, download, storage } from '../utils';

export function Background() {
  return (
    <div class="bg" aria-hidden="true">
      <div class="bg__blob bg__blob--1" />
      <div class="bg__blob bg__blob--2" />
      <div class="bg__blob bg__blob--3" />
      <div class="bg__grid" />
    </div>
  );
}

export function DemoRibbon() {
  const { isDemo } = useApp();
  if (!isDemo) return null;
  return (
    <div class="demo-ribbon" role="note">
      <Icon name="flask" size={16} />
      DEMO DATA — made-up results for previewing the report. This is NOT a real test run.
    </div>
  );
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const t = setTimeout(() => document.addEventListener('click', on), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', on);
    };
  }, [open]);
  return ref;
}

const SWATCH: Record<Accent, string> = {
  azure: 'oklch(62% 0.19 255)',
  violet: 'oklch(62% 0.2 293)',
  emerald: 'oklch(62% 0.15 162)',
  rose: 'oklch(62% 0.19 12)',
  amber: 'oklch(72% 0.16 70)',
  cyan: 'oklch(66% 0.14 215)',
};

function ThemeMenu() {
  const { mode, setMode, accent, setAccent } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const modes: [ThemeMode, string, string][] = [
    ['light', 'sun', 'Light'],
    ['dark', 'moon', 'Dark'],
    ['system', 'monitor', 'Auto'],
  ];
  return (
    <div class="popover-anchor" ref={ref}>
      <button
        class="btn btn--icon"
        aria-label="Theme and colour"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="palette" />
      </button>
      {open && (
        <div class="popover popover--theme glass glass--strong" role="dialog" aria-label="Appearance">
          <div class="seg seg--fill" role="group" aria-label="Theme mode">
            {modes.map(([m, icon, label]) => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                <Icon name={icon} size={14} />
                {label}
              </button>
            ))}
          </div>
          <div class="swatches" role="group" aria-label="Accent colour">
            {ACCENTS.map((a) => (
              <button
                key={a}
                class="swatch"
                style={{ background: SWATCH[a] }}
                aria-pressed={accent === a}
                aria-label={`${a} accent`}
                title={a}
                onClick={() => setAccent(a)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExportMenu() {
  const { report, service, all, list, filters, toast } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener('pii:open-export', on);
    return () => window.removeEventListener('pii:open-export', on);
  }, []);
  const filtered = Boolean(filters.q || filters.endpoint || filters.statuses.length);
  const rows = filtered ? list : service;
  const base = `pii-report-${report.run.runId}${filtered ? '-filtered' : ''}`.replace(/[^a-z0-9-]+/gi, '-');
  const act = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div class="popover-anchor" ref={ref}>
      <button class="btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <Icon name="download" size={16} /> <span class="label">Export</span>
      </button>
      {open && (
        <div class="popover glass glass--strong" role="menu" aria-label="Export">
          {report.meta.pdfFile ? (
            <a
              class="menu-item"
              role="menuitem"
              href={report.meta.pdfFile}
              download
              onClick={() => setOpen(false)}
            >
              <Icon name="pdf" size={16} /> PDF report
            </a>
          ) : (
            <button
              class="menu-item"
              role="menuitem"
              onClick={act(() => {
                toast('Choose “Save as PDF” in the print dialog');
                setTimeout(() => window.print(), 300);
              })}
            >
              <Icon name="printer" size={16} /> Print / save as PDF
            </button>
          )}
          {report.meta.excelFile && (
            <a
              class="menu-item"
              role="menuitem"
              href={report.meta.excelFile}
              download
              onClick={() => setOpen(false)}
            >
              <Icon name="csv" size={16} /> Excel (.xlsx) <small>{all.length} tests</small>
            </a>
          )}
          <button
            class="menu-item"
            role="menuitem"
            onClick={act(() => download(`${base}.csv`, testsToCsv(rows), 'text/csv'))}
          >
            <Icon name="csv" size={16} /> Raw data (CSV) <small>{rows.length} tests</small>
          </button>
          <button
            class="menu-item"
            role="menuitem"
            onClick={act(() => download(`${base}.json`, resultsJson(report, rows), 'application/json'))}
          >
            <Icon name="json" size={16} /> Data (JSON)
          </button>
          <button
            class="menu-item"
            role="menuitem"
            onClick={act(async () =>
              toast(
                (await copyText(chatSummary(report)))
                  ? 'Summary copied — paste it into Slack or ClickUp'
                  : 'Copy failed',
              ),
            )}
          >
            <Icon name="copy" size={16} /> Copy summary <small>Slack · ClickUp</small>
          </button>
        </div>
      )}
    </div>
  );
}

const NAV: [string, string][] = [
  ['summary', 'Summary'],
  ['attention', 'Problems'],
  ['endpoints', 'Endpoints'],
  ['tests', 'Tests'],
  ['about', 'About'],
];

/** Section links with a sliding highlight on the section being read. */
function SectionNav() {
  const [active, setActive] = useState('summary');
  useEffect(() => {
    // Section positions are measured only when the layout changes, not on every scroll frame.
    let tops: [string, number][] = [];
    const measure = () => {
      tops = NAV.map(([id]) => {
        const el = document.getElementById(id);
        return [id, el ? el.getBoundingClientRect().top + window.scrollY : Infinity] as [string, number];
      });
    };
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY + 140;
        let current = 'summary';
        for (const [id, top] of tops) if (top <= y) current = id;
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4)
          current = 'about';
        setActive(current); // same value → no re-render
      });
    };
    const ro = new ResizeObserver(() => {
      measure();
      onScroll();
    });
    ro.observe(document.body);
    measure();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return (
    <nav class="snav" aria-label="Sections">
      {NAV.map(([id, label]) => (
        <button
          key={id}
          class="snav__link"
          aria-current={active === id ? 'true' : undefined}
          onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

export function Topbar() {
  const { report, setUi, isDemo } = useApp();
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header class="topbar">
      <div class="topbar__inner glass glass--strong">
        <div class="brand">
          <Logo size={32} />
          <div class="brand__text">
            <div class="brand__name">{report.meta.product}</div>
            <div class="brand__sub">PII API test report</div>
          </div>
        </div>
        <span class={`tag ${isDemo ? 'status--BLOCKED' : 'tag--accent'}`}>
          {isDemo ? 'DEMO DATA' : 'REAL RUN'}
        </span>
        <SectionNav />
        <button
          class="btn btn--search"
          onClick={() => setUi({ palette: true })}
          aria-label="Search (Ctrl or Cmd + K)"
        >
          <Icon name="search" size={16} />
          <span class="label">Search tests…</span>
          <span class="kbd">{mac ? '⌘' : 'Ctrl'} K</span>
        </button>
        <button
          class="btn btn--icon"
          aria-label="How to read this report"
          title="How to read this report"
          onClick={() => setUi({ guide: true })}
        >
          <Icon name="help" />
        </button>
        <ThemeMenu />
        <ExportMenu />
      </div>
    </header>
  );
}

export function ScrollProgress() {
  // Written straight to the element's style: no React re-render while scrolling.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return (
    <div ref={ref} class="progress-line no-print" style={{ transform: 'scaleX(0)' }} aria-hidden="true" />
  );
}

/**
 * Floating quick actions. The last button folds the whole bar into itself (and back) with a staggered
 * animation; "back to top" takes no space until the page is scrolled.
 */
export function Dock() {
  const { setUi, resolvedTheme, setMode } = useApp();
  const scrolled = useScrolledPast(500);
  const [fs, setFs] = useState(false);
  // Remembered choice; on phones the bar starts folded so it never covers the content.
  const [collapsed, setCollapsed] = useState(() => {
    const saved = storage.get('dock');
    return saved ? saved === 'collapsed' : window.innerWidth < 640;
  });
  useEffect(() => {
    const on = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      storage.set('dock', c ? 'open' : 'collapsed');
      return !c;
    });
  useEffect(() => {
    window.addEventListener('pii:toggle-dock', toggle);
    return () => window.removeEventListener('pii:toggle-dock', toggle);
  }, []);
  const tab = collapsed ? -1 : 0;
  const items: { key: string; icon: string; tip: string; label: string; run: () => void; show?: boolean }[] =
    [
      {
        key: 'top',
        icon: 'arrowUp',
        tip: 'Back to top',
        label: 'Back to top',
        run: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
        show: scrolled,
      },
      {
        key: 'search',
        icon: 'search',
        tip: 'Search (⌘/Ctrl K)',
        label: 'Search',
        run: () => setUi({ palette: true }),
      },
      {
        key: 'theme',
        icon: resolvedTheme === 'dark' ? 'sun' : 'moon',
        tip: `Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} (D)`,
        label: 'Toggle dark mode',
        run: () => setMode(resolvedTheme === 'dark' ? 'light' : 'dark'),
      },
      {
        key: 'export',
        icon: 'download',
        tip: 'Export',
        label: 'Open export menu',
        run: () => window.dispatchEvent(new Event('pii:open-export')),
      },
      {
        key: 'fs',
        icon: fs ? 'shrink' : 'expand',
        tip: fs ? 'Exit full screen' : 'Full screen',
        label: 'Toggle full screen',
        run: () =>
          document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen?.(),
      },
    ];
  return (
    <div
      class="dock glass glass--strong no-print"
      role="toolbar"
      aria-label="Quick actions"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div class="dock__items" id="dock-items" aria-hidden={collapsed}>
        <div class="dock__list">
          {items.map((it, i) => (
            <button
              key={it.key}
              class={`btn${it.key === 'top' ? ' dock__top' : ''}`}
              style={{ '--i': i }}
              data-hidden={it.show === false ? 'true' : 'false'}
              data-tip={it.tip}
              aria-label={it.label}
              tabIndex={it.show === false ? -1 : tab}
              onClick={it.run}
            >
              <Icon name={it.icon} />
            </button>
          ))}
        </div>
      </div>
      <button
        class="btn dock__toggle"
        data-tip={collapsed ? 'Show quick actions (Q)' : 'Hide quick actions (Q)'}
        aria-label={collapsed ? 'Show quick actions' : 'Hide quick actions'}
        aria-expanded={!collapsed}
        aria-controls="dock-items"
        onClick={toggle}
      >
        <Icon name="chevronDown" />
      </button>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div class="toasts" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} class="toast glass glass--strong">
          <Icon name="check" size={16} />
          {t.text}
        </div>
      ))}
    </div>
  );
}
