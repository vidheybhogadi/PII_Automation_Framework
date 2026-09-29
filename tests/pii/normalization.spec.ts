/** Value clean-up (normalization) through the Aisle facade: save a messy value, read the clean one back. */
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { messyText } from '../../src/data/test-data-factory';
import { readValue, seedField } from '../../src/fixtures/steps';
import { blockedBy, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
import { PII_FIELDS } from '../../src/models/pii.models';

test.describe('Aisle facade — normalization', () => {
  onlyIfInScope('writePii', 'readPii');

  test('AISLE-NRM-001 Names are trimmed and repeated spaces collapsed; upper/lower case is kept', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('nrm1');
    const clean = data.name(); // e.g. "Qa Auto Bcde" — single spaces, capitals
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: messyText(clean) });

    expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.NAME }), clean, 'cleaned NAME');
  });

  test('AISLE-NRM-002 A formatted approved test phone is saved as digits only', async () => {
    blockedBy('BQ-03', 'No approved test phones; PHONE access and phone clean-up rules are not confirmed');
  });

  test('AISLE-NRM-003 A phone that is too short or too long after clean-up is rejected', async () => {
    blockedBy('BQ-03', 'PHONE access and the phone length rule are not confirmed for the facade');
  });
});
