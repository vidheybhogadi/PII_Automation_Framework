/** Single-page report: Summary → What needs attention → How each endpoint did → All tests → About this run. */
import {
  countStatuses,
  evaluateGates,
  formatDuration,
  formatPct,
  healthScore,
  OUTCOMES,
  outcomeCounts,
  overallVerdict,
  passRate,
  preflightFailures,
} from '../../core/analytics';
import { CommandPalette, GuideModal, MethodologyModal, ShortcutsModal } from './components/Overlays';
import { Background, DemoRibbon, Dock, ScrollProgress, Toasts, Topbar } from './components/Shell';
import { TestDrawer } from './components/TestDrawer';
import { Boundary, TipLayer } from './components/ui';
import { useHotkeys } from './hooks';
import { Logo } from './icons';
import { About } from './sections/About';
import { Endpoints } from './sections/Endpoints';
import { Attention } from './sections/Attention';
import { Summary, headline } from './sections/Summary';
import { TestList } from './sections/TestList';
import { NOT_RUN, useApp } from './store';
import { fmtDateTime } from './utils';

const SECTION_KEYS: Record<string, string> = {
  '1': 'attention',
  '2': 'endpoints',
  '3': 'tests',
  '4': 'about',
};

/** PDF cover page (print mode only). */
function Cover() {
  const { report, service, isDemo } = useApp();
  const c = countStatuses(service);
  const selfOnly = service.every((t) => t.kind === 'unit');
  const h = healthScore(service, report.endpoints, report.config.health);
  const v = overallVerdict(evaluateGates(service, report.config.gates));
  const o = outcomeCounts(service);
  // Pass and Fail always; the other statuses only when present — keeps the cover line short.
  const checks = OUTCOMES.filter((k) => k === 'Pass' || k === 'Fail' || o[k] > 0)
    .sort((a, b) => (a === 'Pass' ? -1 : b === 'Pass' ? 1 : 0))
    .map((k) => `${o[k]} ${k.toLowerCase()}`)
    .join(' · ');
  return (
    <div class="cover print-only">
      <div>
        <div class="cover__brand">
          <Logo size={44} /> {report.meta.product}
        </div>
        {isDemo && <div class="demo-ribbon">DEMO DATA — made-up results, not a real test run</div>}
        <div class="cover__title">Aisle PII API test report</div>
        <div class="cover__arch">{report.meta.subtitle}</div>
        <div class="cover__headline">
          {
            headline(c, preflightFailures(service).length, selfOnly && c.total > 0, o['Security finding'])
              .text
          }
        </div>
        <dl class="cover__meta">
          <div>
            <dt>Result</dt>
            <dd>{v.verdict}</dd>
          </div>
          <div>
            <dt>Test Health</dt>
            <dd>{h.score === null ? 'N/A' : `${Math.round(h.score)}% — ${h.band}`}</dd>
          </div>
          <div>
            <dt>Test Execution Summary</dt>
            <dd>{checks}</dd>
          </div>
          <div>
            <dt>API Pass Rate</dt>
            <dd>{formatPct(passRate(c))}</dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>{report.run.environment.toUpperCase()}</dd>
          </div>
          <div>
            <dt>When</dt>
            <dd>
              {fmtDateTime(report.run.startedAt)} · {formatDuration(report.run.durationMs)}
            </dd>
          </div>
        </dl>
      </div>
      <div class="cover__foot">
        Contains no personal data, keys or credentials. Every number comes from recorded test results.
      </div>
    </div>
  );
}

export function App() {
  const { ui, setUi, closeTop, setMode, resolvedTheme, isPrint, showTests } = useApp();

  useHotkeys({
    onPalette: () => setUi({ palette: !ui.palette }),
    onEscape: closeTop,
    onKey: (key, e) => {
      if (ui.drawer || ui.palette) return;
      const k = key.toLowerCase();
      const section = SECTION_KEYS[key];
      if (key === '?') {
        e.preventDefault();
        setUi({ shortcuts: true });
      } else if (k === 'd') setMode(resolvedTheme === 'dark' ? 'light' : 'dark');
      else if (key === 'Home' || key === '0') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (section) {
        e.preventDefault();
        document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (k === 'f') showTests({ statuses: ['FAIL'] });
      else if (k === 'w') showTests({ statuses: NOT_RUN });
      else if (k === 'b') showTests({ statuses: ['BLOCKED'] });
      else if (k === 'a') showTests({});
      else if (k === 'e') window.dispatchEvent(new Event('pii:open-export'));
      else if (k === 'q') window.dispatchEvent(new Event('pii:toggle-dock'));
    },
  });

  const anyModal = ui.palette || ui.shortcuts || ui.guide || ui.methodology;
  return (
    <>
      <Background />
      <ScrollProgress />
      <DemoRibbon />
      {!isPrint && <Topbar />}
      <main id="main" class="content" tabIndex={-1}>
        <Cover />
        <Boundary name="Summary">
          <Summary />
        </Boundary>
        <Boundary name="What needs attention">
          <Attention />
        </Boundary>
        <Boundary name="How each endpoint did">
          <Endpoints />
        </Boundary>
        <Boundary name="All tests">
          <TestList />
        </Boundary>
        <Boundary name="About this run">
          <About />
        </Boundary>
      </main>
      {!isPrint && <Dock />}
      <TestDrawer />
      {ui.palette && <CommandPalette />}
      {ui.shortcuts && <ShortcutsModal />}
      {ui.guide && <GuideModal />}
      {ui.methodology && <MethodologyModal />}
      {!anyModal && <TipLayer />}
      <Toasts />
    </>
  );
}
