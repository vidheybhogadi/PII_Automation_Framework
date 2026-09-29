/**
 * Emails the latest QA report with every page of report.pdf shown inline in the message body (no attachment).
 *
 *   npm run report:mail               # send reports/qa-report/ to REPORT_MAIL_TO
 *   npm run report:mail -- --dry-run  # build the email only → reports/email-preview/ (.eml + .html), send nothing
 *   npm run report:mail -- --dry-run --dir reports/archive/<run>   # preview the email for an archived run
 *
 * Email clients cannot display a PDF inline, so each PDF page is rasterised to a PNG (pdf.js in Playwright's
 * Chromium) and embedded as an inline image, below a styled summary (report-mail-template.ts) that is readable
 * even when images are blocked. If no report was produced, a short "run failed" email is sent.
 *
 * Env: SMTP_HOST, SMTP_PORT (587 = STARTTLS, 465 = TLS), SMTP_USER, SMTP_PASSWORD, REPORT_MAIL_FROM (defaults to
 * SMTP_USER), REPORT_MAIL_TO (comma/semicolon/newline-separated list). Never prints the password.
 */
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { PATHS, ROOT } from '../reporting/generator/generate';
import {
  buildNoReportEmail,
  buildReportEmail,
  EMAIL_WIDTH,
  readFacts,
  type ReportFacts,
} from './report-mail-template';

dotenv.config({ path: path.resolve(ROOT, process.env.ENV_FILE ?? '.env'), quiet: true });

const PREVIEW_DIR = path.join(ROOT, 'reports/email-preview');
const PDFJS_DIR = path.join(ROOT, 'node_modules/pdfjs-dist/build');
/** 1.5 × A4 (595 pt) ≈ 890 px wide: sharp text when shown at the email width. */
const RENDER_SCALE = 1.5;

function recipients(): string[] {
  const list = (process.env.REPORT_MAIL_TO ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const invalid = list.filter((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
  if (invalid.length) throw new Error(`REPORT_MAIL_TO has ${invalid.length} invalid address(es).`);
  if (!list.length) throw new Error('REPORT_MAIL_TO is empty — set at least one recipient.');
  return [...new Set(list)];
}

function runUrl(): string | null {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
}

function loadFacts(dir: string): ReportFacts | null {
  const summaryFile = path.join(dir, 'summary.txt');
  const resultsFile = path.join(dir, 'results.json');
  if (!existsSync(summaryFile) || !existsSync(resultsFile)) return null;
  return readFacts(JSON.parse(readFileSync(resultsFile, 'utf8')), readFileSync(summaryFile, 'utf8'));
}

/** Renders every page of the PDF to PNG with pdf.js inside Chromium (no system tools needed). */
async function pdfToPngs(pdfFile: string): Promise<Buffer[]> {
  const files: Record<string, { body: Buffer; type: string }> = {
    '/pdf.mjs': { body: readFileSync(path.join(PDFJS_DIR, 'pdf.min.mjs')), type: 'text/javascript' },
    '/pdf.worker.mjs': {
      body: readFileSync(path.join(PDFJS_DIR, 'pdf.worker.min.mjs')),
      type: 'text/javascript',
    },
    '/report.pdf': { body: readFileSync(pdfFile), type: 'application/pdf' },
    '/': {
      type: 'text/html',
      body: Buffer.from(`<!doctype html><script type="module">
        import * as pdfjs from '/pdf.mjs';
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
        try {
          const doc = await pdfjs.getDocument({ url: '/report.pdf' }).promise;
          const pages = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: ${RENDER_SCALE} });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvas, canvasContext: ctx, viewport }).promise;
            pages.push(canvas.toDataURL('image/png'));
          }
          window.__PAGES__ = pages;
        } catch (e) {
          window.__PAGES_ERROR__ = String(e && e.message || e);
        }
      </script>`),
    },
  };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('http://report.local/**', (route) => {
      const f = files[new URL(route.request().url()).pathname];
      return f ? route.fulfill({ body: f.body, contentType: f.type }) : route.fulfill({ status: 404 });
    });
    await page.goto('http://report.local/');
    const state = () => {
      const w = globalThis as unknown as { __PAGES__?: string[]; __PAGES_ERROR__?: string };
      return { pages: w.__PAGES__ ?? [], error: w.__PAGES_ERROR__ };
    };
    await page.waitForFunction(
      () => {
        const w = globalThis as unknown as { __PAGES__?: string[]; __PAGES_ERROR__?: string };
        return Boolean(w.__PAGES__ || w.__PAGES_ERROR__);
      },
      undefined,
      { timeout: 120_000 },
    );
    const { pages, error } = await page.evaluate(state);
    if (error) throw new Error(`PDF rendering failed: ${error}`);
    return pages.map((d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'));
  } finally {
    await browser.close();
  }
}

function buildMessage(facts: ReportFacts | null, pngs: Buffer[], note: string | null) {
  const url = runUrl();
  const parts = facts
    ? buildReportEmail(facts, {
        runUrl: url,
        note,
        pageCount: pngs.length,
        pagesHtml: pngs
          .map(
            (_, i) =>
              `<img src="cid:page-${i + 1}@pii-report" width="${EMAIL_WIDTH}" alt="Report page ${i + 1} of ${pngs.length}" ` +
              `style="display:block;width:100%;max-width:${EMAIL_WIDTH}px;height:auto;margin:0 0 12px;border:1px solid #e5e7eb;border-radius:6px">`,
          )
          .join('\n'),
      })
    : buildNoReportEmail(url);
  return {
    ...parts,
    attachments: pngs.map((content, i) => ({
      filename: `report-page-${i + 1}.png`,
      content,
      contentType: 'image/png',
      cid: `page-${i + 1}@pii-report`,
      contentDisposition: 'inline' as const,
    })),
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const to = recipients();
  const dirArg = process.argv.indexOf('--dir');
  const dir = dirArg >= 0 ? path.resolve(process.argv[dirArg + 1] ?? '') : PATHS.out;
  const facts = loadFacts(dir);
  const pdf = path.join(dir, 'report.pdf');

  let pngs: Buffer[] = [];
  let renderNote: string | null = null;
  if (facts && existsSync(pdf)) {
    try {
      pngs = await pdfToPngs(pdf);
    } catch (e) {
      renderNote = 'The PDF pages could not be shown in this email; the full report is in the run artifacts.';
      console.error(`  ⚠ ${(e as Error).message}`);
    }
  } else if (facts) {
    renderNote = 'No PDF was produced for this run; the full report is in the run artifacts.';
  }
  const message = buildMessage(facts, pngs, renderNote);
  const sizeMb = (pngs.reduce((n, b) => n + b.length, 0) / 1024 / 1024).toFixed(1);

  if (dryRun) {
    const preview = await nodemailer
      .createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
      .sendMail({ ...message, from: 'preview@example.test', to });
    mkdirSync(PREVIEW_DIR, { recursive: true });
    writeFileSync(path.join(PREVIEW_DIR, 'email.eml'), preview.message as Buffer);
    let html = String(message.html);
    pngs.forEach((b, i) => {
      html = html.replace(`cid:page-${i + 1}@pii-report`, `data:image/png;base64,${b.toString('base64')}`);
    });
    writeFileSync(path.join(PREVIEW_DIR, 'email.html'), html);
    const eml = statSync(path.join(PREVIEW_DIR, 'email.eml')).size / 1024 / 1024;
    console.log(`  Dry run — nothing sent. Subject: ${message.subject}`);
    console.log(
      `  ${pngs.length} page(s) inline (${sizeMb} MB images, ${eml.toFixed(1)} MB email) for ${to.length} recipient(s)`,
    );
    console.log(`  Preview: ${path.relative(ROOT, PREVIEW_DIR)}/email.html and email.eml`);
    return;
  }

  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD } = process.env;
  const missing = Object.entries({ SMTP_HOST, SMTP_USER, SMTP_PASSWORD })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length)
    throw new Error(`Email not sent — missing ${missing.join(', ')} (set them as CI secrets/variables).`);
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  await transport.sendMail({ ...message, from: process.env.REPORT_MAIL_FROM || SMTP_USER, to });
  console.log(
    `  Email sent to ${to.length} recipient(s): ${message.subject} (${pngs.length} page(s), ${sizeMb} MB)`,
  );
}

main().catch((e: Error) => {
  console.error(`✘ ${e.message}`);
  process.exit(1);
});
