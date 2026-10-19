/**
 * Call phases — WHY a request was made. Every API call is logged with its phase so reports can separate the
 * behaviour under test from data seeding and follow-up verification:
 *
 *   test      the request whose response the test asserts on (default)
 *   setup     seeding data the test needs (seedField, createTransient, createKey …)
 *   verify    a follow-up check, e.g. "the rejected write left nothing behind"
 *   preflight the per-worker readiness check
 *
 * AsyncLocalStorage carries the phase through awaits without threading a parameter through every call.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type CallPhase = 'test' | 'setup' | 'verify' | 'preflight';

const store = new AsyncLocalStorage<CallPhase>();

export function currentPhase(): CallPhase {
  return store.getStore() ?? 'test';
}

export function runInPhase<T>(phase: CallPhase, fn: () => Promise<T>): Promise<T> {
  return store.run(phase, fn);
}
