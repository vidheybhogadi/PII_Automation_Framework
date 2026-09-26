/**
 * PII Sentinel dashboard entry. Reads window.__PII_REPORT__ (set by data/report-data.js), validates it, renders.
 * Print mode (?mode=print) renders every section expanded, light theme, no animation, and sets
 * window.__PII_READY__ = true once fonts and charts have finished — used by `npm run report:pdf`.
 */
import { render } from 'preact';
import type { ReportData } from '../../core/types';
import { App } from './app';
import { Icon } from './icons';
import { AppProvider } from './store';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/print.css';
import { normalizeReport, validateReport } from './validate';

declare global {
  interface Window {
    __PII_REPORT__?: unknown;
    __PII_READY__?: boolean;
    __PII_ERRORS__?: string[];
  }
}
declare const __DEV__: boolean;

const root = document.getElementById('app') as HTMLElement;
const isPrint = /[?&]mode=print\b/.test(location.search);
if (isPrint) document.documentElement.dataset.print = 'true';

if (__DEV__) {
  // esbuild live reload during `npm run report:dev`
  new EventSource('/esbuild').addEventListener('change', () => location.reload());
}

const { fatal, warnings } = validateReport(window.__PII_REPORT__);
root.removeAttribute('aria-busy');
root.innerHTML = '';

if (fatal) {
  render(
    <div class="error-page glass glass--strong" role="alert">
      <div class="row">
        <Icon name="alert" size={28} />
        <h1 style={{ fontSize: '1.4rem' }}>Report data could not be loaded</h1>
      </div>
      <p>{fatal}</p>
      <p class="small muted">
        If raw results exist, they are also available in results.csv and results.json next to this page.
      </p>
    </div>,
    root,
  );
  window.__PII_READY__ = true;
} else {
  const normalized = normalizeReport(window.__PII_REPORT__ as ReportData);
  // Validation warnings join the generator's diagnostics in the "Good to know" box.
  const report = { ...normalized, diagnostics: [...new Set([...normalized.diagnostics, ...warnings])] };
  render(
    <AppProvider report={report} isPrint={isPrint}>
      <App />
    </AppProvider>,
    root,
  );
  const markReady = () => {
    void document.fonts.ready.then(() => {
      // Two frames so the last chart paint is committed before PDF capture.
      requestAnimationFrame(() => requestAnimationFrame(() => (window.__PII_READY__ = true)));
    });
  };
  setTimeout(markReady, isPrint ? 300 : 0);
}
