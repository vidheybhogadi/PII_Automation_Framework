/**
 * All test-case descriptions, merged. Read by the report generator and by docs/test-cases.xlsx.
 * Add new entries to the area file (e.g. write.ts); self-test UT-DOC-002 keeps this in sync with the tests.
 */
import { AUTHENTICATION_CASES } from './authentication';
import { AUTHORIZATION_CASES } from './authorization';
import { BATCH_READ_CASES } from './batch-read';
import { CONTRACT_CASES } from './contract';
import { DATABASE_CASES } from './database';
import { FREE_TEXT_CASES } from './free-text';
import { HEALTH_CASES } from './health';
import { NORMALIZATION_CASES } from './normalization';
import { POC_CASES } from './poc';
import { READ_CASES } from './read';
import { RESPONSE_SECURITY_CASES } from './response-security';
import { SEARCH_CASES } from './search';
import { TENANT_ISOLATION_CASES } from './tenant-isolation';
import { TRANSIENT_CASES } from './transient';
import type { TestCaseCatalog, TestCaseInfo } from './types';
import { WRITE_CASES } from './write';

export type { Priority, TestCaseCatalog, TestCaseInfo, TestType } from './types';

export const TEST_CASES: TestCaseCatalog = {
  ...HEALTH_CASES,
  ...WRITE_CASES,
  ...NORMALIZATION_CASES,
  ...READ_CASES,
  ...SEARCH_CASES,
  ...BATCH_READ_CASES,
  ...TRANSIENT_CASES,
  ...FREE_TEXT_CASES,
  ...AUTHENTICATION_CASES,
  ...AUTHORIZATION_CASES,
  ...TENANT_ISOLATION_CASES,
  ...RESPONSE_SECURITY_CASES,
  ...DATABASE_CASES,
  ...CONTRACT_CASES,
  ...POC_CASES,
};

/** The description for a test ID, or undefined when none has been written yet. */
export function testCaseInfo(id: string): TestCaseInfo | undefined {
  return TEST_CASES[id];
}
