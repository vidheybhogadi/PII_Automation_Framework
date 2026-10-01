/**
 * Test-data factory: unique, synthetic, traceable identities and values.
 *
 * - User IDs and emails are generated from the run ID + worker index + a counter -> unique in parallel.
 * - Made-up user IDs are accepted by the Aisle staging facade (observed 2026-09-29), so every test creates
 *   its own users: "<run id>-w<worker>-<n>-<label>" — clearly synthetic, never production-looking.
 * - Emails use the approved test domain (AISLE_TEST_EMAIL_DOMAIN, e.g. example.test); never a real mailbox.
 * - Phone numbers come ONLY from the team-approved list (AISLE_TEST_PHONES). The framework never invents a
 *   phone number that could belong to a real person.
 * - The `normalize*` functions are the expected clean-up rules, used as the test oracle. NAME rules were
 *   observed on staging; EMAIL/PHONE rules are still to be confirmed (EMAIL/PHONE return 403 today).
 */
import { ConfigError, requireValue, type FrameworkConfig } from '../config/config';
import { LIMITS } from '../models/pii.models';
import { SAFE_ID_PATTERN } from './test-identifiers';

/**
 * Sanity range for configured approved phones: E.164 numbers have at most 15 digits; shorter than 8 cannot
 * be a real subscriber number. This checks OUR configuration only — the service's own phone rules are
 * observed on staging 2026-10-01 (digits only; 5–7 and 16 digits refused).
 */
const PHONE_DIGITS = { min: 8, max: 15 } as const;

// ---- Expected normalization rules ---------------------------------------------------------------

/** Email: trimmed and converted to lowercase (observed on staging 2026-10-01). */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Phone: all non-digits removed (observed on staging 2026-10-01). */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidNormalizedPhone(digits: string): boolean {
  return /^\d+$/.test(digits) && digits.length >= PHONE_DIGITS.min && digits.length <= PHONE_DIGITS.max;
}

/**
 * Name: leading/trailing spaces removed and runs of inner spaces collapsed to one; capitals kept.
 * OBSERVED on staging ("  QA   Auto Probe " -> "QA Auto Probe"). Tabs/newlines are not covered.
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
      'AISLE_TEST_EMAIL_DOMAIN',
      'Generating test emails',
    );
    return `${this.compactRunId}.w${this.workerIndex}.${this.next()}.${label}@${domain}`.toLowerCase();
  }

  /**
   * Unique synthetic name in normalized form (single spaces, trimmed), clearly QA-only:
   * "QA Automation User Bcdab". Letters only after the prefix (digits are mapped to letters).
   */
  name(): string {
    const seq = this.next();
    const suffix = [...`${this.workerIndex}${seq}${this.runId.slice(-4)}`]
      .map((ch) => (/\d/.test(ch) ? String.fromCharCode(97 + Number(ch)) : ch))
      .join('');
    return `QA Automation User ${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
  }

  /**
   * A unique, clearly synthetic user ID of exactly `length` characters (for the observed 1–128 limit).
   * Lengths above the limit are allowed on purpose: boundary tests send them and expect a 422.
   */
  userIdOfLength(length: number, label = 'len'): string {
    const base = this.userId(label);
    return length <= base.length ? base.slice(0, length) : base + '-'.padEnd(length - base.length, 'x');
  }

  /** A value of exactly `length` chars, used for the observed 1024-char upper bound (NAME field). */
  textOfLength(length: number): string {
    const base = `Qa ${this.compactRunId} `;
    return (base + 'x'.repeat(Math.max(0, length))).slice(0, length);
  }

  /** Approved test phone by index (round-robin). Fails with an actionable message if none are configured. */
  phone(index = 0): ApprovedPhone {
    const phones = requireValue(
      this.config.testData.phones.length ? this.config.testData.phones : undefined,
      'AISLE_TEST_PHONES',
      'Phone scenarios',
    );
    const input = phones[index % phones.length] as string;
    const normalized = normalizePhone(input);
    if (!isValidNormalizedPhone(normalized)) {
      throw new ConfigError(
        `AISLE_TEST_PHONES entry #${index % phones.length} does not normalize to 8-15 digits; fix the configuration.`,
      );
    }
    return { input, normalized };
  }

  /** Number of approved phones available. */
  get phoneCount(): number {
    return this.config.testData.phones.length;
  }
}
