/** Value clean-up (normalization) through the Aisle facade: save a messy value, read the clean one back. */
import { expectError, expectNoData, expectSuccess } from '../../src/assertions/response.assertions';
import { expectSecretEquals } from '../../src/assertions/security.assertions';
import { formattedPhone, messyText } from '../../src/data/test-data-factory';
import { expectNotPersisted, readValue, seedField } from '../../src/fixtures/steps';
import {
  expect,
  noteObserved,
  onlyIfInScope,
  requireApprovedPhones,
  test,
} from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import { PII_FIELDS, searchIdsOnlyDataSchema } from '../../src/models/pii.models';

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

  test('AISLE-NRM-002 An approved test phone written with “+”, spaces, brackets and dashes is saved as digits only', async ({
    aisle,
    data,
    cleanup,
    config,
  }) => {
    requireApprovedPhones(config);
    noteObserved('2026-10-01', 'PHONE "+NN (NNN) NNN-NNNN" and "+digits" → 201, read back as digits only');
    const phone = data.phone(0);
    for (const written of [formattedPhone(phone.normalized), `+${phone.normalized}`]) {
      const userId = data.userId('nrm2');
      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.PHONE, value: written });
      expectSecretEquals(
        await readValue(aisle, { userId, field: PII_FIELDS.PHONE }),
        phone.normalized,
        'PHONE saved as digits only',
      );
    }
  });

  test('AISLE-NRM-003 A phone that is too short or too long after clean-up, or has no digits, is rejected (400) and nothing is saved', async ({
    aisle,
    data,
  }) => {
    noteObserved('2026-10-01', 'PHONE of 5 / 7 / 16 digits or with no digits → 400 VALIDATION_ERROR');
    // Made-up invalid values only — never a number that could belong to a real person.
    for (const invalid of ['12345', '1234567', '1234567890123456', '+-() ']) {
      const userId = data.userId('nrm3');
      const res = await aisle.call('writePii', { user_id: userId, field: PII_FIELDS.PHONE, value: invalid });
      expectError(res, 400, ERROR_CODES.VALIDATION_ERROR);
      expectNoData(res);
      await expectNotPersisted(aisle, { userId, field: PII_FIELDS.PHONE });
    }
  });

  test('AISLE-NRM-004 Hidden characters in a name: tab, line break, carriage return and non-breaking space become a normal space; a zero-width space is kept', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved(
      '2026-10-01',
      '\t \n \r and U+00A0 → space; U+200B (zero-width) kept unchanged (no Unicode normalisation — Dev / user decision 2026-11-19)',
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

  test('AISLE-NRM-005 Names are stored and searched exactly as sent: é as one character and e + accent mark are different text', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved(
      '2026-11-19',
      'no Unicode normalisation (Dev / user decision, not a bug): NAME with U+00E9 → exact search with U+00E9 finds the user (count 1); search with U+0065 U+0301 → 200, count 0; read back returns the one-character form unchanged',
    );
    const userId = data.userId('nrm5');
    const base = data.name();
    const composed = `${base} Jos\u00e9`;
    const decomposed = `${base} Jose\u0301`;
    expect(composed === decomposed, 'the two forms are different strings').toBe(false);
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: composed });

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      composed,
      'NAME read back in the one-character form',
    );
    const search = (value: string) =>
      aisle.call(
        'searchPii',
        { value, limit: 10, include_values: false },
        { pathParams: { field: PII_FIELDS.NAME } },
      );
    const same = expectSuccess(await search(composed), 200, searchIdsOnlyDataSchema);
    expect(same.count, 'exact search with the same form').toBe(1);
    expect(same.matches.map((m) => m.user_id)).toEqual([userId]);

    const other = expectSuccess(await search(decomposed), 200, searchIdsOnlyDataSchema);
    expect(other.count, 'search with e + accent mark finds nothing').toBe(0);
    expect(other.matches).toEqual([]);
  });
});
