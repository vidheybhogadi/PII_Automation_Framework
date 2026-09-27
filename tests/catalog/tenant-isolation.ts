import type { TestCaseCatalog } from './types';

export const TENANT_ISOLATION_CASES: TestCaseCatalog = {
  'PII-TI-001': {
    what: 'Saves a different email for the same user ID in tenant A and tenant B, then reads each one back.',
    why: 'The same user ID in two companies is two different people; if values got mixed, one customer could see or overwrite another customer’s data.',
    steps: [
      'Save email A for a fake user ID in tenant A',
      'Save email B for the same user ID in tenant B',
      'Read the email in tenant A, then in tenant B',
    ],
    expected:
      'Both reads return 200 OK; each reply is labelled with its own tenant and contains only its own email (A in tenant A, B in tenant B).',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs a second test tenant',
  },
  'PII-TI-002': {
    what: 'Saves an email under customer A (tenant A), then tries to read it while asking as customer B.',
    why: 'Customers must be completely separated; if this returned the email, one company could read another company’s users’ personal data.',
    steps: [
      'Save a fake email for a fake user in tenant A',
      'Read the same user’s email but with tenant B in the request',
      'Check the reply',
    ],
    expected: '404 Not Found with the not-found error code; no value from tenant A is returned.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs a second test tenant',
  },
  'PII-TI-003': {
    what: 'Saves the same email for one user in tenant A and another user in tenant B, then searches for it in tenant A only.',
    why: 'If search looked across tenants, one customer could discover another customer’s users just by searching for an email.',
    steps: [
      'Save a shared fake email for user A in tenant A',
      'Save the same email for user B in tenant B',
      'Search for the email in tenant A',
      'Check the matches',
    ],
    expected: '200 OK; the reply is labelled tenant A and the matches list contains only user A.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs a second test tenant',
  },
  'PII-TI-004': {
    what: 'Saves an email for a user in tenant A, then uses bulk read (reading many users in one request) in tenant B to ask for that user.',
    why: 'Bulk read can pull lots of data at once; if it crossed tenants, one customer could mass-copy another customer’s data.',
    steps: [
      'Save a fake email for a fake user in tenant A',
      'Bulk-read that user’s email with tenant B in the request',
      'Check the reply',
    ],
    expected: '404 Not Found with the not-found error code.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs a second test tenant',
  },
  'PII-TI-005': {
    what: 'Saves emails for the same user ID in tenant A and tenant B, changes the tenant A email, then reads the tenant B email.',
    why: 'If an update in one company changed another company’s data, customers could corrupt each other’s records.',
    steps: [
      'Save an email for a fake user ID in tenant A',
      'Save a different email for the same user ID in tenant B',
      'Change the email in tenant A',
      'Read the email in tenant B',
    ],
    expected: '200 OK; tenant B still returns its original email, unchanged.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs a second test tenant',
  },
  'PII-TI-006': {
    what: 'Saves an email with the main caller, then reads it with a second, different app (the secondary caller) that also has read permission in the same tenant.',
    why: 'The documented design lets any permitted app in a tenant read that tenant’s data; this confirms apps are not wrongly locked to only their own data.',
    steps: [
      'As the main caller, save a fake email for a fake user',
      'As the secondary caller, read that user’s email in the same tenant',
      'Check the value',
    ],
    expected: '200 OK; the returned email matches the one that was saved.',
    type: 'Positive',
    priority: 'High',
    preconditions: 'Needs a second registered caller (secondary) — skipped until configured',
  },
};
