/**
 * Cleanup registry.
 *
 * The guide documents exactly ONE lifecycle-ending operation usable for cleanup: revoking free-text keys.
 * There is NO documented delete for PII records, and transient mappings end by expiry or promotion.
 * Direct DB deletes are NOT allowed (shared environment, read-only credentials by design).
 *
 * So:
 *   - `register()`   — approved API cleanup actions (e.g. revoke a key). Run in reverse order after the test.
 *   - `leaveBehind()` — records data that cannot be removed via an approved mechanism, so the report states
 *                      it honestly (masked, run-prefixed identifiers) instead of pretending it was cleaned.
 */
import { maskIdentifier } from './redaction';

export interface CleanupSummary {
  performed: string[];
  failed: string[];
  leftBehind: string[];
}

export class CleanupRegistry {
  private readonly actions: { description: string; action: () => Promise<void> }[] = [];
  private readonly remaining: string[] = [];

  register(description: string, action: () => Promise<void>): void {
    this.actions.push({ description, action });
  }

  leaveBehind(kind: string, identifier: string, reason = 'no approved deletion API'): void {
    this.remaining.push(`${kind} ${maskIdentifier(identifier)} (${reason})`);
  }

  async run(): Promise<CleanupSummary> {
    const summary: CleanupSummary = { performed: [], failed: [], leftBehind: [...this.remaining] };
    for (const { description, action } of [...this.actions].reverse()) {
      try {
        await action();
        summary.performed.push(description);
      } catch (error) {
        summary.failed.push(`${description}: ${(error as Error).name}`);
      }
    }
    this.actions.length = 0;
    return summary;
  }
}
