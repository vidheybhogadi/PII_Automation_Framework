import type { TestCaseCatalog } from './types';

export const POC_CASES: TestCaseCatalog = {
  'POC-001': {
    what: 'Saves a messy fake test email (mixed case, extra spaces) for a brand-new fake user, checks the database holds it encrypted under the right tenant and user, reads it back cleaned up, and checks our logs contain no personal data.',
    why: 'This is the end-to-end proof that the core promise works: data goes in, is stored encrypted for the right owner, comes back correctly, and never leaks into logs or reports.',
    steps: [
      'Create a fake test user and confirm reading their email gives 404 PII_NOT_FOUND (the user is new)',
      'Save a messy version of a fake test email as the EMAIL field',
      'Look up the stored row in the database and check tenant, user, field and that the email is not readable there',
      'Read the email back through the service',
      'Search the test logs and report notes for the email',
    ],
    expected:
      'Save: 201 "PII write successful" with the same tenant, user and EMAIL; database: exactly one row for that tenant/user/field, neither the cleaned nor the typed email stored in readable form, and its key version matches the save reply (if the database exposes it); read: 200 "PII read successful" with one item whose value is the cleaned-up (lower-case, trimmed) email; logs and report notes contain no copy of the email.',
    type: 'Database',
    priority: 'Critical',
    preconditions:
      'Needs read-only database access. If the database does not expose a key version column, that single check is skipped and noted against Dev question Q-16.',
  },
};
