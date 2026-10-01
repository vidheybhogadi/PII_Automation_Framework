/** UNIT — configuration parsing, secret handling and actionable errors. */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import {
  ConfigError,
  assertIntegrationConfig,
  isDbConfigured,
  loadConfig,
  requireToken,
} from '../../src/config/config';
import { DEFAULT_AISLE_BASE_URL } from '../../src/config/env-schema';
import { ENDPOINT_KEYS } from '../../src/clients/endpoints';
import { buildPendingDoc, PENDING_DOC } from '../../scripts/generate-pending-doc';
import { pendingSettings } from '../../src/config/placeholders';
import { scrubText } from '../../src/utils/redaction';

/** Synthetic test token — NOT a real credential. */
const FAKE_TOKEN = 'unitTestToken0123456789abcdef0000';

const validEnv = {
  AISLE_BASE_URL: 'https://staging.aisle.example/V1/',
  AISLE_TEST_TOKEN: FAKE_TOKEN,
  AISLE_TEST_EMAIL_DOMAIN: 'qa.example',
  AISLE_TEST_PHONES: '+10 000 000 00, 1234567890',
};

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error('expected function to throw');
}

test.describe('UNIT configuration', () => {
  test('UT-CFG-001 With no .env, settings load with safe defaults (verified staging URL, no token)', () => {
    const cfg = loadConfig({});
    expect(cfg.baseUrl).toBe(DEFAULT_AISLE_BASE_URL);
    expect(DEFAULT_AISLE_BASE_URL).toBe('https://testa2.aisle.co/V1');
    expect(cfg.token).toBeUndefined();
    expect(cfg.testData.emailDomain).toBe('example.test');
    expect(cfg.http.timeoutMs).toBe(30_000);
    expect(cfg.db.engine).toBe('none');
    expect(cfg.endpointsInScope).toEqual(ENDPOINT_KEYS);
  });

  test('UT-CFG-002 A valid .env loads correctly (URL tidied, phone list parsed, token wrapped)', () => {
    const cfg = loadConfig(validEnv);
    expect(cfg.baseUrl).toBe('https://staging.aisle.example/V1');
    expect(cfg.token?.reveal()).toBe(FAKE_TOKEN);
    expect(cfg.testData.phones).toEqual(['+10 000 000 00', '1234567890']);
    expect(() => assertIntegrationConfig(cfg)).not.toThrow();
  });

  test('UT-CFG-003 A missing Aisle token is reported with a hint on where to get it', () => {
    const err = errorOf(() => assertIntegrationConfig(loadConfig({})));
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message).toContain('AISLE_TEST_TOKEN');
    expect(err.message).toContain('docs/setup-guide.md');
    expect(errorOf(() => requireToken(loadConfig({}))).message).toContain('AISLE_TEST_TOKEN');
  });

  test('UT-CFG-004 Invalid settings are rejected without printing the value', () => {
    const err = errorOf(() =>
      loadConfig({ AISLE_BASE_URL: 'ftp://secret-host-value', PII_HTTP_TIMEOUT_MS: 'abc' }),
    );
    expect(err.message).toContain('AISLE_BASE_URL');
    expect(err.message).toContain('PII_HTTP_TIMEOUT_MS');
    expect(err.message).not.toContain('secret-host-value');
  });

  test('UT-CFG-005 Printing the settings never shows the token or the database password', () => {
    const cfg = loadConfig({ ...validEnv, DB_PASSWORD: 'SuperSecretDbPass' });
    const rendered = `${inspect(cfg, { depth: 10 })} ${JSON.stringify(cfg)} ${String(cfg.token)}`;
    expect(rendered).not.toContain(FAKE_TOKEN);
    expect(rendered).not.toContain('SuperSecretDbPass');
    expect(cfg.db.password?.reveal()).toBe('SuperSecretDbPass');
  });

  test('UT-CFG-006 Once loaded, the token is scrubbed from any text, even without "Bearer"', () => {
    loadConfig(validEnv);
    expect(scrubText(`failed with token ${FAKE_TOKEN} in url`)).not.toContain(FAKE_TOKEN);
    expect(scrubText(`Authorization: Bearer ${FAKE_TOKEN}`)).not.toContain(FAKE_TOKEN);
  });

  test('UT-CFG-007 DB validation counts as configured only when engine, connection and queries are all set', () => {
    expect(isDbConfigured(loadConfig({}))).toBe(false);
    const partial = loadConfig({ DB_ENGINE: 'postgres', DB_HOST: 'db.example' });
    expect(isDbConfigured(partial)).toBe(false);
    const full = loadConfig({
      DB_ENGINE: 'postgres',
      DB_HOST: 'db.example',
      DB_NAME: 'pii',
      DB_USER: 'qa_readonly',
      DB_PASSWORD: 'x-unit-password',
      DB_QUERIES_FILE: 'config/db-queries.json',
    });
    expect(isDbConfigured(full)).toBe(true);
  });

  test('UT-CFG-009 Endpoint scope accepts a subset and rejects unknown endpoint names', () => {
    expect(loadConfig({ PII_ENDPOINTS_IN_SCOPE: 'writePii, readPii' }).endpointsInScope).toEqual([
      'writePii',
      'readPii',
    ]);
    expect(errorOf(() => loadConfig({ PII_ENDPOINTS_IN_SCOPE: 'writePii,deletePii' })).message).toContain(
      'deletePii',
    );
  });

  test('UT-CFG-010 Optional fixed test users are validated against the observed 128-character limit', () => {
    expect(loadConfig({ AISLE_TEST_USER_ID: 'qa-fixed-user' }).testData.userId).toBe('qa-fixed-user');
    expect(errorOf(() => loadConfig({ AISLE_TEST_USER_ID: 'x'.repeat(129) })).message).toContain(
      'AISLE_TEST_USER_ID',
    );
  });

  test('UT-CFG-011 Settings still set to a PENDING_ placeholder count as not set and are never used', () => {
    const env = {
      AISLE_TEST_TOKEN: 'PENDING_AISLE_TEST_TOKEN',
      AISLE_TEST_PHONES: 'PENDING_APPROVED_TEST_PHONES',
      DB_ENGINE: 'PENDING_DB_ENGINE',
      DB_HOST: 'PENDING_DB_HOST',
    };
    const config = loadConfig(env);
    expect(config.token).toBeUndefined();
    expect(config.testData.phones).toEqual([]);
    expect(config.db.engine).toBe('none');
    expect(pendingSettings(env)).toEqual(['AISLE_TEST_PHONES', 'AISLE_TEST_TOKEN', 'DB_ENGINE', 'DB_HOST']);
  });
});

test('UT-DOC-001 PENDING-PLACEHOLDERS.md lists every placeholder and is up to date (npm run docs:pending)', () => {
  const current = readFileSync(PENDING_DOC, 'utf8');
  expect(current, 'PENDING-PLACEHOLDERS.md is stale — run: npm run docs:pending').toBe(buildPendingDoc());
});

test('UT-DOC-003 backend-open-questions.md keeps only OPEN questions, or says "All clear" when none are left', () => {
  const text = readFileSync(path.resolve(__dirname, '../../docs/backend-open-questions.md'), 'utf8');
  const visible = text.replace(/<!--[\s\S]*?-->/g, ''); // ignore the template comment
  const lines = visible.split('\n');
  const rows = lines.filter((l) => /^\|\s*BQ-\d+\s*\|/.test(l));
  const notOpen = rows
    .map((l) => ({ id: /BQ-\d+/.exec(l)?.[0], status: l.split('|').slice(-2, -1)[0]?.trim() }))
    .filter((r) => r.status !== 'Open')
    .map((r) => `${r.id} [${r.status}]`);
  expect(
    notOpen,
    'answered / observed / closed questions must be deleted, not kept with another status',
  ).toEqual([]);
  // A table header left without any question under it (all its questions were removed) must be deleted too.
  const emptyTables = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => /^\|\s*ID\s*\|/.test(l) && !/^\|\s*BQ-\d+/.test(lines[i + 2] ?? ''))
    .map(({ i }) => `table at line ${i + 1}`);
  expect(emptyTables, 'remove empty question tables (and their headings)').toEqual([]);
  if (rows.length === 0)
    expect(visible, 'with no open questions the file must say so').toContain('All clear');
});
