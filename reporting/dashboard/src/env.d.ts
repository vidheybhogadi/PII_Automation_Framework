/** CSS imports are bundled by esbuild into assets/app.css. */
declare module '*.css';

/** src/utils/redaction.ts (shared with Node) references Buffer inside redact(); the dashboard only uses scrubText. */
declare const Buffer: { isBuffer(value: unknown): value is { length: number } };
