/** UNIT — configuration parsing and actionable errors. */
import { expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';
import {
  ConfigError,
  assertIntegrationConfig,
  loadConfig,
  normalizePrivateKeyText,
  requireCaller,
  requireTenant,
} from '../../src/config/config';
import { ENDPOINT_KEYS } from '../../src/clients/endpoints';
import { buildPendingDoc, PENDING_DOC } from '../../scripts/generate-pending-doc';
import { pendingSettings } from '../../src/config/placeholders';
import { RFC8032_TEST1_PRIVATE_KEY_PEM } from './helpers/test-keys';

const keyDir = mkdtempSync(path.join(tmpdir(), 'pii-cfg-'));
const keyFile = path.join(keyDir, 'unit.pem');
writeFileSync(keyFile, RFC8032_TEST1_PRIVATE_KEY_PEM, { mode: 0o600 });

const validEnv = {
  PII_BASE_URL: 'http://127.0.0.1:8001/',
  PII_CALLER_PRIMARY_ID: 'unit-caller',
  PII_CALLER_PRIMARY_PRIVATE_KEY_FILE: keyFile,
  PII_TEST_TENANT_ID: 'tenant-unit',
  PII_TEST_TENANT_ID_SECONDARY: 'tenant-unit-2',
  PII_TEST_EMAIL_DOMAIN: 'qa.example',
  PII_TEST_PHONES: '+10 000 000 00, 1234567890',
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
  test('UT-CFG-001 With no .env, settings load with their documented defaults', () => {
    const cfg = loadConfig({});
    expect(cfg.baseUrl).toBeUndefined();
    expect(cfg.limits).toMatchObject({
      batchMaxItems: 50,
      searchDefaultLimit: 10,
      transientTtlMinSeconds: 300,
      transientTtlMaxSeconds: 604_800,
    });
    expect(cfg.db.engine).toBe('none');
    expect(cfg.endpointsInScope).toEqual(ENDPOINT_KEYS);
  });

  test('UT-CFG-002 A valid .env loads correctly (URL tidied, phone list parsed)', () => {
    const cfg = loadConfig(validEnv);
    expect(cfg.baseUrl).toBe('http://127.0.0.1:8001');
    expect(cfg.callers.primary?.callerId).toBe('unit-caller');
    expect(cfg.testData.phones).toEqual(['+10 000 000 00', '1234567890']);
    expect(() => assertIntegrationConfig(cfg)).not.toThrow();
  });

  test('UT-CFG-003 All missing settings are reported at once, each with a hint', () => {
    const err = errorOf(() => assertIntegrationConfig(loadConfig({})));
    expect(err).toBeInstanceOf(ConfigError);
    for (const name of [
      'PII_BASE_URL',
      'PII_CALLER_PRIMARY_ID',
      'PII_TEST_TENANT_ID',
      'PII_TEST_EMAIL_DOMAIN',
    ]) {
      expect(err.message).toContain(name);
    }
    expect(err.message).toContain('docs/setup-guide.md');
  });

  test('UT-CFG-004 Invalid settings are rejected without printing the value', () => {
    const err = errorOf(() =>
      loadConfig({ PII_BASE_URL: 'ftp://secret-host-value', PII_BATCH_MAX_ITEMS: 'abc' }),
    );
    expect(err.message).toContain('PII_BASE_URL');
    expect(err.message).toContain('PII_BATCH_MAX_ITEMS');
    expect(err.message).not.toContain('secret-host-value');
  });

  test('UT-CFG-005 A private key can be given inline (with \\n line breaks) or Base64-encoded', () => {
    const escaped = RFC8032_TEST1_PRIVATE_KEY_PEM.replace(/\n/g, '\\n');
    expect(normalizePrivateKeyText(escaped)).toBe(RFC8032_TEST1_PRIVATE_KEY_PEM.trim());
    const b64 = Buffer.from(RFC8032_TEST1_PRIVATE_KEY_PEM).toString('base64');
    expect(normalizePrivateKeyText(b64)).toBe(RFC8032_TEST1_PRIVATE_KEY_PEM.trim());
  });

  test('UT-CFG-006 Caller setup errors say what to fix and never contain key text', () => {
    const noKey = errorOf(() => loadConfig({ PII_CALLER_LIMITED_ID: 'x' }));
    expect(noKey.message).toContain('PII_CALLER_LIMITED_PRIVATE_KEY_FILE');
    const both = errorOf(() =>
      loadConfig({ ...validEnv, PII_CALLER_PRIMARY_PRIVATE_KEY: RFC8032_TEST1_PRIVATE_KEY_PEM }),
    );
    expect(both.message).toContain('not both');
    expect(both.message).not.toContain('MC4CAQAw');
    const badPath = errorOf(() =>
      loadConfig({ ...validEnv, PII_CALLER_PRIMARY_PRIVATE_KEY_FILE: '/nope/missing.pem' }),
    );
    expect(badPath.message).toContain('could not be read');
  });

  test('UT-CFG-007 Printing the settings never shows keys or the database password', () => {
    const cfg = loadConfig({ ...validEnv, DB_PASSWORD: 'SuperSecretDbPass' });
    const rendered = `${inspect(cfg, { depth: 10 })} ${JSON.stringify(cfg)}`;
    expect(rendered).not.toContain('MC4CAQAw');
    expect(rendered).not.toContain('SuperSecretDbPass');
    expect(cfg.db.password?.reveal()).toBe('SuperSecretDbPass');
  });

  test('UT-CFG-008 Required-setting checks explain exactly what is missing', () => {
    const cfg = loadConfig({ ...validEnv, PII_TEST_TENANT_ID_SECONDARY: '' });
    expect(errorOf(() => requireCaller(cfg, 'limited')).message).toContain('PII_CALLER_LIMITED_ID');
    expect(errorOf(() => requireTenant(cfg, 'secondary')).message).toContain('PII_TEST_TENANT_ID_SECONDARY');
    const same = loadConfig({ ...validEnv, PII_TEST_TENANT_ID_SECONDARY: 'tenant-unit' });
    expect(errorOf(() => requireTenant(same, 'secondary')).message).toContain('must differ');
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

  test('UT-CFG-010 On/off switches, lifetime limits and 8/15-digit test phones are validated', () => {
    expect(loadConfig({ PII_ENABLE_TTL_EXPIRY_TEST: 'true' }).features.ttlExpiryTest).toBe(true);
    expect(errorOf(() => loadConfig({ PII_ENABLE_TTL_EXPIRY_TEST: 'maybe' })).message).toContain(
      'PII_ENABLE_TTL_EXPIRY_TEST',
    );
    expect(
      errorOf(() =>
        loadConfig({ PII_TRANSIENT_TTL_MIN_SECONDS: '900', PII_TRANSIENT_TTL_MAX_SECONDS: '300' }),
      ).message,
    ).toContain('must not be greater');
    expect(errorOf(() => loadConfig({ PII_TEST_PHONE_8_DIGITS: '1234567' })).message).toContain(
      'PII_TEST_PHONE_8_DIGITS',
    );
  });

  test('UT-CFG-011 Settings still set to a PENDING_ placeholder count as not set and are never used', () => {
    const env = {
      PII_BASE_URL: 'PENDING_PII_BASE_URL',
      PII_TEST_TENANT_ID: 'PENDING_TEST_TENANT_ID',
      PII_BATCH_MAX_ITEMS: 'PENDING_BATCH_MAX_ITEMS',
      PII_CALLER_PRIMARY_ID: 'PENDING_PRIMARY_CALLER_ID',
      PII_CALLER_PRIMARY_PRIVATE_KEY_FILE: './secrets/does-not-exist.pem',
      DB_ENGINE: 'PENDING_DB_ENGINE',
    };
    const config = loadConfig(env);
    expect(config.baseUrl).toBeUndefined();
    expect(config.tenants.primary).toBeUndefined();
    expect(config.limits.batchMaxItems).toBe(50); // the guide's development value while pending
    expect(config.callers.primary).toBeUndefined(); // a pending caller is "not configured", not broken
    expect(config.db.engine).toBe('none');
    expect(pendingSettings(env)).toEqual([
      'DB_ENGINE',
      'PII_BASE_URL',
      'PII_BATCH_MAX_ITEMS',
      'PII_CALLER_PRIMARY_ID',
      'PII_TEST_TENANT_ID',
    ]);
  });
});

test('UT-DOC-001 PENDING-PLACEHOLDERS.md lists every placeholder and is up to date (npm run docs:pending)', () => {
  const current = readFileSync(PENDING_DOC, 'utf8');
  expect(current, 'PENDING-PLACEHOLDERS.md is stale — run: npm run docs:pending').toBe(buildPendingDoc());
});
