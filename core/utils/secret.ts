import { inspect } from 'node:util';

/**
 * Wraps a sensitive string (bearer token, DB password, raw free-text key...).
 *
 * The value is kept in a JavaScript private field (`#value`), so it is NOT an enumerable property.
 * As a result it does not appear in console.log output, JSON.stringify output, Playwright assertion
 * diffs or error messages. Code that genuinely needs the value must call `.reveal()`, which makes
 * every use of a secret easy to find with a text search.
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  get length(): number {
    return this.#value.length;
  }

  toString(): string {
    return '[REDACTED]';
  }

  toJSON(): string {
    return '[REDACTED]';
  }

  [inspect.custom](): string {
    return 'Secret([REDACTED])';
  }
}
