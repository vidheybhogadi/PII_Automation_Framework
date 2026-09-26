/**
 * Centralized, redacting logger.
 *
 * Every entry is sanitized BEFORE it is stored or printed (see redaction.ts). Each Playwright test gets
 * its own Logger (via fixtures) whose entries are attached to the HTML report as `api-calls.log`, so a
 * failed test shows endpoint / method / request ID / status / duration — and never PII, keys or signatures.
 *
 * This is the only module allowed to use console.* (enforced by ESLint's no-console rule).
 */
import { redact, scrubText } from './redaction';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  level?: LogLevel;
  /** Also print to stdout/stderr (off by default; enable with PII_LOG_TO_CONSOLE=true). */
  toConsole?: boolean;
  /** Static context added to every entry, e.g. { test: 'PII-WR-001' }. */
  context?: Record<string, unknown>;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly toConsole: boolean;
  private readonly context: Record<string, unknown>;
  /** Shared between a logger and its children so a test's full log can be attached at the end. */
  private readonly buffer: string[];

  constructor(options: LoggerOptions = {}, buffer: string[] = []) {
    this.level = options.level ?? 'info';
    this.toConsole = options.toConsole ?? false;
    this.context = options.context ?? {};
    this.buffer = buffer;
  }

  child(context: Record<string, unknown>): Logger {
    return new Logger(
      { level: this.level, toConsole: this.toConsole, context: { ...this.context, ...context } },
      this.buffer,
    );
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write('error', message, context);
  }

  /**
   * Re-emit entries captured by another logger (e.g. the per-worker preflight check) into this one, merging extra
   * context. Entries go through the normal sanitizing write path again.
   */
  replay(lines: readonly string[], extra: Record<string, unknown> = {}): void {
    for (const line of lines) {
      try {
        const { ts: _ts, level, msg, ...ctx } = JSON.parse(line) as Record<string, unknown>;
        const lvl = (['debug', 'info', 'warn', 'error'] as const).find((l) => l === level) ?? 'info';
        this.write(lvl, typeof msg === 'string' ? msg : 'replayed entry', { ...ctx, ...extra });
      } catch {
        /* not a structured entry — skip */
      }
    }
  }

  /** Sanitized log lines recorded so far (for report attachments and leak-detection tests). */
  lines(): readonly string[] {
    return [...this.buffer];
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: scrubText(message),
      ...(redact({ ...this.context, ...context }) as Record<string, unknown>),
    };
    const line = JSON.stringify(entry);
    this.buffer.push(line);
    if (this.toConsole) {
      if (level === 'error' || level === 'warn') console.error(line);
      else console.log(line);
    }
  }
}
