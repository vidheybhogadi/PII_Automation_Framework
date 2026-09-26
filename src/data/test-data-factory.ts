/**
 * Test-data factory: unique, synthetic, traceable identities and values.
 *
 * - User IDs and emails are generated from the run ID + worker index + a counter -> unique in parallel.
 * - Emails use the team-approved domain (PII_TEST_EMAIL_DOMAIN); never a real mailbox.
 * - Phone numbers come ONLY from the team-approved list (PII_TEST_PHONES). The framework never invents a
 *   phone number that could belong to a real person.
 * - The `normalize*` functions are the documented normalization rules, used as the test oracle.
 */
import { ConfigError, requireValue, type FrameworkConfig } from '../config/config';
import { LIMITS } from '../models/pii.models';
import { SAFE_ID_PATTERN } from './test-identifiers';

// ---- Documented normalization rules (guide "Value normalization") ------------------------------

/** Email: trimmed and converted to lowercase; must contain "@". */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Phone: all non-digits removed; result must contain 8 to 15 digits. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidNormalizedPhone(digits: string): boolean {
  return (
    /^\d+$/.test(digits) && digits.length >= LIMITS.phoneDigits.min && digits.length <= LIMITS.phoneDigits.max
  );
}

/**
 * Name/default text: leading/trailing whitespace removed and internal whitespace collapsed.
 * NOTE: tests only use runs of plain spaces; whether tabs/newlines are collapsed is not documented (Q-10).
 */
export function normalizeText(input: string): string {
  return input.trim().replace(/ {2,}/g, ' ');
}

// ---- Presentation variants for normalization tests --------------------------------------------

/** "person@x.example" -> "  PeRsOn@X.ExAmPlE  " (mixed case + surrounding whitespace). */
export function messyEmail(normalized: string): string {
  const mixed = [...normalized].map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c)).join('');
  return `  ${mixed}  `;
}

/** "919876543210" -> "+91 (987) 654-3210" style formatting (non-digits only; digits unchanged). */
export function formattedPhone(digits: string): string {
  if (digits.length < 8) return digits;
  return `+${digits.slice(0, 2)} (${digits.slice(2, 5)}) ${digits.slice(5, 8)}-${digits.slice(8)}`;
}

/** "Qa Auto User" -> "   Qa   Auto   User  " */
export function messyText(normalized: string): string {
  return `   ${normalized.split(' ').join('   ')}  `;
}

export interface ApprovedPhone {
  /** As supplied in configuration (may include formatting). */
  readonly input: string;
  /** Digits only — the documented normalized form. */
  readonly normalized: string;
}

export class TestDataFactory {
  private counter = 0;
  private readonly compactRunId: string;

  constructor(
    private readonly config: FrameworkConfig,
    readonly runId: string,
    private readonly workerIndex: number,
  ) {
    if (!SAFE_ID_PATTERN.test(runId)) {
      throw new ConfigError('PII_TEST_RUN_ID may only contain lowercase letters, digits, "." and "-".');
    }
    this.compactRunId = runId.replace(/-/g, '');
  }

  private next(): number {
    this.counter += 1;
    return this.counter;
  }

  /** Unique, traceable user ID (well under the documented 128-char limit). */
  userId(label = 'u'): string {
    const id = `${this.runId}-w${this.workerIndex}-${this.next()}-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (id.length > LIMITS.userId.max)
      throw new Error(`Generated user_id exceeds ${LIMITS.userId.max} chars`);
    return id;
  }

  /** Several unique user IDs. */
  userIds(count: number, label = 'u'): string[] {
    return Array.from({ length: count }, () => this.userId(label));
  }

  /** Unique synthetic email in normalized (lowercase, trimmed) form. */
  email(label = 'e'): string {
    const domain = requireValue(
      this.config.testData.emailDomain,
      'PII_TEST_EMAIL_DOMAIN',
      'Generating test emails',
    );
    return `${this.compactRunId}.w${this.workerIndex}.${this.next()}.${label}@${domain}`.toLowerCase();
  }

  /** Unique synthetic name in normalized form (single spaces, trimmed). Letters only after the prefix. */
  name(): string {
    const seq = this.next();
    const suffix = [...`${this.workerIndex}${seq}${this.runId.slice(-4)}`]
      .map((ch) => (/\d/.test(ch) ? String.fromCharCode(97 + Number(ch)) : ch))
      .join('');
    return `Qa Auto ${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
  }

  /** A value of exactly `length` chars, used for the documented 1024-char upper bound (NAME field). */
  textOfLength(length: number): string {
    const base = `Qa ${this.compactRunId} `;
    return (base + 'x'.repeat(Math.max(0, length))).slice(0, length);
  }

  /** Approved test phone by index (round-robin). Fails with an actionable message if none are configured. */
  phone(index = 0): ApprovedPhone {
    const phones = requireValue(
      this.config.testData.phones.length ? this.config.testData.phones : undefined,
      'PII_TEST_PHONES',
      'Phone scenarios',
    );
    const input = phones[index % phones.length] as string;
    const normalized = normalizePhone(input);
    if (!isValidNormalizedPhone(normalized)) {
      throw new ConfigError(
        `PII_TEST_PHONES entry #${index % phones.length} does not normalize to 8-15 digits; fix the configuration.`,
      );
    }
    return { input, normalized };
  }

  /** Number of approved phones available. */
  get phoneCount(): number {
    return this.config.testData.phones.length;
  }

  tenant(): string {
    return requireValue(this.config.tenants.primary, 'PII_TEST_TENANT_ID', 'Tenant-scoped scenarios');
  }

  secondaryTenant(): string {
    const tenant = requireValue(
      this.config.tenants.secondary,
      'PII_TEST_TENANT_ID_SECONDARY',
      'Tenant-isolation scenarios',
    );
    if (tenant === this.config.tenants.primary) {
      throw new ConfigError('PII_TEST_TENANT_ID_SECONDARY must differ from PII_TEST_TENANT_ID.');
    }
    return tenant;
  }
}
