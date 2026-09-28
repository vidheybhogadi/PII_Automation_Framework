/** UNIT — test data factory and documented normalization oracles. */
import { expect, test } from '@playwright/test';
import { ConfigError, loadConfig } from '../../src/config/config';
import {
  TestDataFactory,
  formattedPhone,
  isValidNormalizedPhone,
  messyEmail,
  messyText,
  normalizeEmail,
  normalizePhone,
  normalizeText,
} from '../../src/data/test-data-factory';
import { generateRunId } from '../../src/data/test-identifiers';
import { LIMITS } from '../../src/models/pii.models';

const config = loadConfig({
  PII_TEST_EMAIL_DOMAIN: 'qa.example',
  PII_TEST_TENANT_ID: 'tenant-a',
  PII_TEST_TENANT_ID_SECONDARY: 'tenant-b',
  PII_TEST_PHONES: '+10 (000) 000-000, 12345',
});

test.describe('UNIT test data factory', () => {
  test('UT-DAT-001 Run IDs have the prefix, a timestamp and a random part, and are safe to use as IDs', () => {
    const a = generateRunId('qa-auto', new Date('2026-09-26T10:15:00.000Z'));
    expect(a).toMatch(/^qa-auto-20260926t101500-[0-9a-f]{4}$/);
    expect(generateRunId('qa-auto')).not.toBe(generateRunId('qa-auto'));
  });

  test('UT-DAT-002 Generated user IDs and emails are unique across parallel workers and within length limits', () => {
    const runId = generateRunId('qa-auto');
    const w0 = new TestDataFactory(config, runId, 0);
    const w1 = new TestDataFactory(config, runId, 1);
    const ids = [...w0.userIds(50), ...w1.userIds(50)];
    expect(new Set(ids).size).toBe(100);
    ids.forEach((id) => expect(id.length).toBeLessThanOrEqual(LIMITS.userId.max));
    ids.forEach((id) => expect(id.startsWith(runId)).toBe(true));
    const emails = [w0.email(), w0.email(), w1.email()];
    expect(new Set(emails).size).toBe(3);
    emails.forEach((e) => expect(e).toBe(normalizeEmail(e)));
    emails.forEach((e) => expect(e.endsWith('@qa.example')).toBe(true));
  });

  test('UT-DAT-003 Generated names are unique and already in clean form', () => {
    const f = new TestDataFactory(config, generateRunId('qa-auto'), 0);
    const names = [f.name(), f.name(), f.name()];
    names.forEach((n) => expect(normalizeText(n)).toBe(n));
    expect(new Set(names).size).toBe(3);
  });

  test('UT-DAT-004 Approved test phones are cleaned up, and invalid ones in .env are rejected', () => {
    const f = new TestDataFactory(config, generateRunId('qa-auto'), 0);
    expect(f.phone(0)).toEqual({ input: '+10 (000) 000-000', normalized: '10000000000' });
    expect(() => f.phone(1)).toThrow(ConfigError); // "12345" is too short -> config error, not a silent pass
    const noPhones = new TestDataFactory(loadConfig({ PII_TEST_EMAIL_DOMAIN: 'qa.example' }), 'qa-auto-x', 0);
    expect(() => noPhones.phone()).toThrow(/PII_TEST_PHONES/);
  });

  test('UT-DAT-005 Expected clean-up results match the guide’s rules', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com');
    expect(normalizePhone('+91 98765 43210')).toBe('919876543210');
    expect(normalizeText('   Qa    Auto   User  ')).toBe('Qa Auto User');
    expect(isValidNormalizedPhone('1234567')).toBe(false);
    expect(isValidNormalizedPhone('12345678')).toBe(true);
    expect(isValidNormalizedPhone('123456789012345')).toBe(true);
    expect(isValidNormalizedPhone('1234567890123456')).toBe(false);
  });

  test('UT-DAT-006 Messy versions of a value clean up back to the original', () => {
    expect(normalizeEmail(messyEmail('abc.def@qa.example'))).toBe('abc.def@qa.example');
    expect(messyEmail('abc@qa.example')).not.toBe('abc@qa.example');
    expect(normalizePhone(formattedPhone('919876543210'))).toBe('919876543210');
    expect(formattedPhone('919876543210')).toMatch(/[^\d]/);
    expect(normalizeText(messyText('Qa Auto User'))).toBe('Qa Auto User');
  });

  test('UT-DAT-007 Text of an exact length is generated correctly', () => {
    const f = new TestDataFactory(config, generateRunId('qa-auto'), 0);
    expect(f.textOfLength(1024)).toHaveLength(1024);
    expect(f.textOfLength(1025)).toHaveLength(1025);
  });

  test('UT-DAT-008 Test tenants come from .env when set, otherwise are generated per run, and always differ', () => {
    const f = new TestDataFactory(config, 'qa-auto-x', 0);
    expect(f.tenant()).toBe('tenant-a');
    expect(f.secondaryTenant()).toBe('tenant-b');
    // Not set (or still PENDING_): one made-up tenant pair per run, the same for every worker of that run.
    const unset = loadConfig({ PII_TEST_TENANT_ID: 'PENDING_TEST_TENANT_ID' });
    const w0 = new TestDataFactory(unset, 'qa-auto-20260928t101500-ab12', 0);
    const w3 = new TestDataFactory(unset, 'qa-auto-20260928t101500-ab12', 3);
    expect(w0.tenant()).toBe('qa-auto-20260928t101500-ab12-app-a');
    expect(w0.secondaryTenant()).toBe('qa-auto-20260928t101500-ab12-app-b');
    expect(w3.tenant()).toBe(w0.tenant());
    expect(new TestDataFactory(unset, 'qa-auto-20260928t111500-cd34', 0).tenant()).not.toBe(w0.tenant());
    const same = new TestDataFactory(
      loadConfig({ PII_TEST_TENANT_ID: 't', PII_TEST_TENANT_ID_SECONDARY: 't' }),
      'qa-auto-x',
      0,
    );
    expect(() => same.secondaryTenant()).toThrow(/must differ/);
  });
});
