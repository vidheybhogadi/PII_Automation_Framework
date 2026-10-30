/**
 * Shared shape of the manual milestone test cases (procedure confirmed with Dev 2026-10-29):
 *   M2 First name · M3 Email · M4 Phone number · M5 Free text — one sheet each in docs/Test cases.xlsx,
 *   built by m2/scripts/generate-milestone-cases.ts.
 *
 * Every milestone is tested module by module, in this order (the sheet keeps it): Aisle, Aisle CMS, Vernacs,
 * Vernacs CMS, Notifications, Django, Socket, Redis cache, then cross-cutting resilience / data consistency.
 */

export const MODULES = [
  'Aisle',
  'Aisle CMS',
  'Vernacs',
  'Vernacs CMS',
  'Notifications',
  'Django',
  'Socket',
  'Redis Cache',
  'Resilience & Consistency',
] as const;
export type Module = (typeof MODULES)[number];

/** Result columns: A = Android, I = iOS, W = Web, C = CMS, D = DB (PII DB + Aisle DB), R = Redis. */
export type Platform = 'A' | 'I' | 'W' | 'C' | 'D' | 'R';
export type Suite = 'Smoke' | 'Sanity' | 'Regression';
export type Priority = 'P0' | 'P1' | 'P2';

/**
 * Kind of case (sheet column "Type"), so the tester can see every kind is covered:
 *   Positive = happy path works · Negative = invalid input / not allowed / error is handled ·
 *   Edge = limits, emoji, Unicode, spaces, case, rapid repeat, two devices, offline, killed app, stale screen ·
 *   Security = privacy, leaks, other users' data, roles, plaintext outside PII ·
 *   Resilience = PII down, partial failure, stores out of sync, retries, recovery.
 */
export const KINDS = ['Positive', 'Negative', 'Edge', 'Security', 'Resilience'] as const;
export type Kind = (typeof KINDS)[number];

export interface MilestoneCase {
  module: Module;
  /** Sub-area inside the module, e.g. "Onboarding", "Profile view", "Search", "TTL". */
  area: string;
  priority: Priority;
  suite: Suite;
  kind: Kind;
  /** Result columns the case applies to, e.g. 'AID'. Others are prefilled "Not Required". */
  on: string;
  title: string;
  why: string;
  steps: string[];
  verify: string[];
  expected: string;
  comment?: string;
  /** Applicable columns prefilled "Blocked" instead of "Test Pending" (reason goes in the comment). */
  blocked?: string;
}
