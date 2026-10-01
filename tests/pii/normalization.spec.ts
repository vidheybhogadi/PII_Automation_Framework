/** Value clean-up (normalization) through the Aisle facade: save a messy value, read the clean one back. */
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { messyText } from '../../src/data/test-data-factory';
import { readValue, seedField } from '../../src/fixtures/steps';
import { blockedBy, noteAssumption, onlyIfInScope, test } from '../../src/fixtures/test-fixtures';
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

  test('AISLE-NRM-004 Hidden characters in a name: tab, line break, carriage return and non-breaking space become a normal space; a zero-width space is kept', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption(
      'BQ-36',
      'observed 2026-10-01: \t \n \r and U+00A0 → space; U+200B (zero-width) kept unchanged; Dev to confirm the rule',
    );
    const cases: [string, 'space' | 'kept'][] = [
      ['\t', 'space'],
      ['\n', 'space'],
      ['\r', 'space'],
      [' ', 'space'],
      ['​', 'kept'],
    ];
    for (const [hidden, outcome] of cases) {
      const userId = data.userId('nrm4');
      const [first, ...rest] = data.name().split(' ');
      const sent = `${first}${hidden}${rest.join(' ')}`;
      const expected = outcome === 'space' ? `${first} ${rest.join(' ')}` : sent;
      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: sent });
      expectSecretEquals(
        await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
        expected,
        `NAME with hidden U+${hidden.codePointAt(0)?.toString(16).padStart(4, '0')}`,
      );
    }
  });

  test('AISLE-NRM-005 The same accented letter written in two Unicode forms (é as one character, or e + accent mark) is stored and searched as the same text', async () => {
    blockedBy(
      'BQ-36',
      'on 2026-10-01 names were stored as sent (no Unicode normalization) and an email saved with é (one character) was NOT found when searched with e + accent mark; whether they must match is Dev’s decision',
    );
  });
});
