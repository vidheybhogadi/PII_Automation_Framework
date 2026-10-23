/**
 * Synthetic test phone numbers for M2 app accounts (M2Q-03, answered 2026-10-23): any +91 mobile number that
 * starts with 10 (10xxxxxxxx), EXCEPT the reserved 106 series (1060000000–1069999999). OTP 1234 works on staging.
 * Numbers are derived from the run id, so every run uses its own numbers and never a real person's.
 */
import { createHash } from 'node:crypto';

export const TEST_OTP = '1234';
export const TEST_COUNTRY_CODE = '+91';

/** True for an allowed test number: 10 digits, starts with 10, not in the 106 series. */
export function isAllowedTestNumber(n: string): boolean {
  return /^10\d{8}$/.test(n) && !n.startsWith('106');
}

/** Third digit: anything but 6 (keeps every number out of the 106 series). */
const THIRD = '012345789';

/** The `index`-th test number of a run: deterministic per (runId, index), unique within a run in practice. */
export function testPhoneNumber(runId: string, index: number): string {
  const digest = createHash('sha256').update(`${runId}#${index}`).digest();
  const third = THIRD[digest[0]! % THIRD.length]!;
  const rest = Array.from({ length: 7 }, (_, i) => String(digest[i + 1]! % 10)).join('');
  const n = `10${third}${rest}`;
  if (!isAllowedTestNumber(n)) throw new Error('Generated test number is outside the allowed range');
  return n;
}
