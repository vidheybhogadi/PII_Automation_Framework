/**
 * Test-case catalog: the plain-English description of every service test, keyed by its test ID.
 *
 * This is what the Excel sheet (docs/test-cases.xlsx) and the HTML report show to a reader, so it must be
 * understandable by someone new to the project. Self-test UT-DOC-002 fails if a test has no entry here, or if an
 * entry has no test — so the catalog always matches the code.
 *
 * When you add a test, add its entry to the file for that area (tests/catalog/<area>.ts).
 */
import type { EndpointKey } from '../../src/clients/endpoints';

export type TestType = 'Positive' | 'Negative' | 'Security' | 'Database' | 'Contract';
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface TestCaseInfo {
  /** What the test does, in one or two plain sentences. No jargon without a short explanation. */
  what: string;
  /** Why we test it: the risk or the requirement it protects. One or two sentences. */
  why: string;
  /** 2–5 short steps, in order, as a tester would describe them. */
  steps: string[];
  /** The concrete expected outcome: status code plus the key facts that are checked. */
  expected: string;
  type: TestType;
  priority: Priority;
  /** Anything needed beyond the basic setup, e.g. "Needs read-only database access". Omit when none. */
  preconditions?: string;
  /**
   * The endpoint this test mainly checks — decides its heading in the report and its section in the Excel sheet.
   * Omit it when the test ID prefix already says it (PII-WR → Save PII, PII-RD → Read PII, …).
   * Use 'crossEndpoint' for tests that span several endpoints. Self-test UT-DOC-002 asks for it when needed.
   */
  endpoint?: EndpointKey | 'crossEndpoint';
}

export type TestCaseCatalog = Record<string, TestCaseInfo>;
