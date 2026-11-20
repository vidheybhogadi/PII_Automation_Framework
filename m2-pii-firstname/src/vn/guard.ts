/**
 * The vernac team-number guard (QA lead decision 2026-11-11, an explicit exception to the never-106 rule for vernac
 * only): the suite may log in ONLY with the nine team numbers 1061616161, 1062626262 … 1069696969 (OTP 1234), ONLY on
 * the vernac host https://testapp.koode.co and ONLY in Anbe, Arike, Neene and Neetho. HeyDil is out of scope.
 *
 * Everything else is refused before a request is sent: any other number (including the rest of the 106 series),
 * any other host (these numbers are never used on Aisle / testa2), HeyDil or an unknown app. The Aisle guard
 * (m2/src/auth/test-phone.ts, never the 106 series) is untouched.
 */
export const VN_HOST = 'https://testapp.koode.co';

/** The nine team numbers: "10" + ("6" + d) × 4 for d = 1 … 9. */
export const TEAM_NUMBERS: readonly string[] = Object.freeze(
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `10${`6${d}`.repeat(4)}`),
);

/** The four in-scope apps (app_lists ids, read from the vernac DB 2026-11-11). HeyDil (3) is out of scope. */
export const VN_APPS = { Arike: 2, Anbe: 4, Neetho: 5, Neene: 6 } as const;
export type VnApp = keyof typeof VN_APPS;
export const VN_APP_NAMES = Object.keys(VN_APPS) as VnApp[];
export const OUT_OF_SCOPE_APPS = ['HeyDil'] as const;

export class VnGuardError extends Error {
  constructor(message: string) {
    super(`Vernac guard refused (nothing sent): ${message}`);
    this.name = 'VnGuardError';
  }
}

/** True for one of the nine team numbers (10 digits, exact match). */
export const isTeamNumber = (n: unknown): n is string => typeof n === 'string' && TEAM_NUMBERS.includes(n);

export const isVnApp = (a: unknown): a is VnApp =>
  typeof a === 'string' && (VN_APP_NAMES as string[]).includes(a);

/** Refuse a host that is not the vernac staging host (trailing slashes ignored). */
export function assertVnHost(baseUrl: string): void {
  if (baseUrl.replace(/\/+$/, '') !== VN_HOST)
    throw new VnGuardError('the team numbers are used only on the vernac staging host');
}

/** Refuse an app that is not Anbe, Arike, Neene or Neetho (HeyDil included). */
export function assertVnApp(app: unknown): asserts app is VnApp {
  if (!isVnApp(app)) throw new VnGuardError('only Anbe, Arike, Neene and Neetho are in scope');
}

/** Refuse a number that is not one of the nine (the message never echoes the number). */
export function assertTeamNumber(n: unknown): asserts n is string {
  if (!isTeamNumber(n)) throw new VnGuardError('not one of the nine team numbers');
}

/**
 * Everything a vernac app login needs, checked together: host, app, number and that the read-only DB lookup found an
 * existing (not deleted) user WITH a profile for that number in that app — a login would otherwise CREATE a new user
 * (user.rb:44-50; QA lead 2026-11-11: never onboard new users, M2FNQ-51).
 */
export function assertLoginAllowed(input: {
  baseUrl: string;
  app: unknown;
  number: unknown;
  knownUser: { app: string; number: string; hasProfile: boolean } | undefined;
}): void {
  assertVnHost(input.baseUrl);
  assertVnApp(input.app);
  assertTeamNumber(input.number);
  const k = input.knownUser;
  if (!k || k.app !== input.app || k.number !== input.number)
    throw new VnGuardError(
      'the DB shows no existing user for this number in this app (a login would create one)',
    );
  if (!k.hasProfile) throw new VnGuardError('the user has no profile (a login would continue onboarding)');
}
