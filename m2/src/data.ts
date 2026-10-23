/**
 * Synthetic M2 test data. Everything carries the run id (qa-m2-<stamp>-<rand>), so it is traceable, collision-free
 * across workers and runs, and can never be mistaken for a real user. Names are letters only ("Qa" + run letters).
 */
const toLetters = (s: string) =>
  [...s.replace(/[^a-z0-9]/gi, '')]
    .map((ch) => (/\d/.test(ch) ? String.fromCharCode(97 + Number(ch)) : ch.toLowerCase()))
    .join('');

export class M2Data {
  private seq = 0;
  constructor(
    readonly runId: string,
    private readonly worker: number,
  ) {}

  /** A synthetic non-numeric user_id (allowed on the test-token routes — M2Q-20, answered 2026-10-23). */
  userId(label: string): string {
    return `${this.runId}-w${this.worker}-${label}-${this.seq++}`;
  }

  /** A unique synthetic first name, letters only, e.g. "Qaxkbdfe". */
  firstName(): string {
    const tail = toLetters(`${this.runId.slice(-4)}${this.worker}${this.seq++}`);
    return `Qa${tail.charAt(0).toUpperCase()}${tail.slice(1)}`;
  }
}
