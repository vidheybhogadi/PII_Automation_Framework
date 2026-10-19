/**
 * Save PII — POST /api/v1/pii-test through the Aisle facade.
 * Expected results are OBSERVED on staging (2026-09-29 / 2026-10-01); open points are listed in
 * docs/backend-open-questions.md. EMAIL calls keep a runtime access gate in case access is withdrawn.
 */
import {
  expectError,
  expectNoServerError,
  expectStatus,
  expectSuccess,
  expectValidationError,
} from '../../src/assertions/response.assertions';
import { expectResponseDoesNotEcho, expectSecretEquals } from '../../src/assertions/security.assertions';
import { messyEmail } from '../../src/data/test-data-factory';
import { BLOCKERS, expectNotPersisted, readValue, seedField } from '../../src/fixtures/steps';
import {
  blockedBy,
  blockIfAccessDenied,
  expect,
  noteAssumption,
  noteObserved,
  onlyIfInScope,
  requireApprovedPhones,
  test,
} from '../../src/fixtures/test-fixtures';
import { ERROR_CODES } from '../../src/models/common.models';
import {
  batchReadDataSchema,
  LIMITS,
  PII_FIELDS,
  readPiiDataSchema,
  writePiiDataSchema,
} from '../../src/models/pii.models';

test.describe('Aisle facade — save PII', () => {
  onlyIfInScope('writePii', 'readPii');

  test(
    'AISLE-WR-001 Saving a name for a brand-new fake user returns 201 with the saved field details',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('wr1');
      const name = data.name();

      const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: name });
      cleanup.leaveBehind('PII NAME', userId);

      const saved = expectSuccess(res, 201, writePiiDataSchema);
      expect(saved).toMatchObject({ user_id: userId, field: PII_FIELDS.NAME });
      expect(saved.key_version).toBeGreaterThanOrEqual(1);
      expectResponseDoesNotEcho(res, name);
    },
  );

  test(
    'AISLE-WR-002 Full name lifecycle: save, read, replace (200), read the new name, bulk read the new name',
    { tag: ['@smoke', '@phase1'] },
    async ({ aisle, data, cleanup }) => {
      const userId = data.userId('wr2');
      const nameA = data.name();
      const nameB = data.name();

      await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: nameA });
      expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.NAME }), nameA, 'read NAME A');

      const replace = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: nameB });
      const saved = expectSuccess(replace, 200, writePiiDataSchema);
      expect(saved).toMatchObject({ user_id: userId, field: PII_FIELDS.NAME });

      expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.NAME }), nameB, 'read NAME B');

      const bulk = expectSuccess(
        await aisle.batchRead({ user_ids: [userId], fields: [PII_FIELDS.NAME] }),
        200,
        batchReadDataSchema,
      );
      expect(bulk.count).toBe(1);
      expect(bulk.items[0]?.user_id).toBe(userId);
      expectSecretEquals(bulk.items[0]?.value, nameB, 'bulk-read NAME B');
    },
  );

  test('AISLE-WR-003 Save requests with a number instead of text for the value or the user ID are rejected (422) and the saved name stays the same', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('wr3');
    const original = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: original });

    const numberValue = await aisle.call('writePii', {
      user_id: userId,
      field: PII_FIELDS.NAME,
      value: 12345,
    });
    expectValidationError(numberValue, 'value');

    const numberUser = await aisle.call('writePii', {
      user_id: 12345,
      field: PII_FIELDS.NAME,
      value: data.name(),
    });
    expectValidationError(numberUser, 'user_id');

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      original,
      'NAME unchanged',
    );
  });

  test('AISLE-WR-004 Saving an empty value is rejected (422)', async ({ aisle, data, cleanup }) => {
    const userId = data.userId('wr4');
    const original = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: original });

    const res = await aisle.call('writePii', { user_id: userId, field: PII_FIELDS.NAME, value: '' });
    expectValidationError(res, 'value');

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      original,
      'NAME unchanged',
    );
  });

  test('AISLE-WR-005 Values exactly at the maximum length are accepted (user ID 128 characters, name 1,024 characters)', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-09-29', 'limits user ID 128 and value 1,024 characters');
    const userId = data.userIdOfLength(LIMITS.userId.max);
    const longName = data.textOfLength(LIMITS.value.max);
    expect(userId).toHaveLength(LIMITS.userId.max);
    expect(longName).toHaveLength(LIMITS.value.max);

    const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: longName });
    cleanup.leaveBehind('PII NAME', userId);
    expectSuccess(res, 201, writePiiDataSchema);

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      longName,
      'max-length NAME',
    );
  });

  test('AISLE-WR-006 Values one character over the maximum are rejected (422) and nothing changes', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-09-29', 'limits user ID 128 and value 1,024 characters');
    const userId = data.userId('wr6');
    const original = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: original });

    const longUser = await aisle.call('writePii', {
      user_id: data.userIdOfLength(LIMITS.userId.max + 1),
      field: PII_FIELDS.NAME,
      value: data.name(),
    });
    expectValidationError(longUser, 'user_id');

    const longValue = await aisle.call('writePii', {
      user_id: userId,
      field: PII_FIELDS.NAME,
      value: data.textOfLength(LIMITS.value.max + 1),
    });
    expectValidationError(longValue, 'value');

    expectSecretEquals(
      await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
      original,
      'NAME unchanged',
    );
  });

  test('AISLE-WR-008 Saving an unknown field name is refused (403 AUTHORIZATION_DENIED)', async ({
    aisle,
    data,
    config,
  }) => {
    noteObserved('2026-09-29', 'an unknown field name → 403 AUTHORIZATION_DENIED');
    const res = await aisle.call('writePii', {
      user_id: data.userId('wr8'),
      field: config.testData.unsupportedField,
      value: data.name(),
    });
    expectError(res, 403, ERROR_CODES.AUTHORIZATION_DENIED);
  });

  test('AISLE-WR-009 An email without “@” is rejected and nothing is saved', async ({ aisle, data }) => {
    const userId = data.userId('wr9');
    const notAnEmail = data.email('wr9').replace('@', '.at.');

    const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: notAnEmail });
    blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
    noteObserved('2026-10-01', 'an email without "@" → 400 VALIDATION_ERROR');
    expectNoServerError(res, 'invalid email');
    expectStatus(res, [400, 422], 'invalid email rejected');
    await expectNotPersisted(aisle, { userId, field: PII_FIELDS.EMAIL });
  });

  test('AISLE-WR-010 Saving a fake email and reading it back returns it cleaned up', async ({
    aisle,
    data,
    cleanup,
  }) => {
    const userId = data.userId('wr10');
    const email = data.email('wr10');
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: messyEmail(email),
      blocker: BLOCKERS.email,
    });

    const res = await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.EMAIL] });
    blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
    noteObserved('2026-10-01', 'EMAIL is trimmed and lower-cased');
    const read = expectSuccess(res, 200, readPiiDataSchema);
    expect(read.count).toBe(1);
    expect(read.items[0]).toMatchObject({
      user_id: userId,
      field: PII_FIELDS.EMAIL,
    });
    expectSecretEquals(read.items[0]?.value, email, 'cleaned-up EMAIL');
  });
  test('AISLE-WR-011 A value made only of spaces, tabs or line breaks is rejected (422) for NAME and EMAIL, and nothing is saved', async ({
    aisle,
    data,
  }) => {
    noteObserved('2026-10-01', 'whitespace-only value → 422 string_too_short on body.value');
    for (const [field, value] of [
      [PII_FIELDS.NAME, '   '],
      [PII_FIELDS.NAME, ' \t\n '],
      [PII_FIELDS.EMAIL, '   '],
    ] as const) {
      const userId = data.userId('wr11');
      const res = await aisle.call('writePii', { user_id: userId, field, value });
      expectValidationError(res, 'value');
      await expectNotPersisted(aisle, { userId, field });
    }
  });

  test('AISLE-WR-012 User IDs are matched exactly after trimming: spaces around the ID are ignored, but capitals or one extra letter mean a different user', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption(
      'BQ-34',
      'observed 2026-10-01: user_id is trimmed and case-sensitive; Dev to confirm this is the intended identity rule',
    );
    const userId = data.userId('wr12');
    const name = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });

    const spaced = await aisle.readPii({ user_id: ` ${userId} `, field_names: [PII_FIELDS.NAME] });
    const read = expectSuccess(spaced, 200, readPiiDataSchema);
    expect(read.user_id, 'reply names the trimmed user ID').toBe(userId);
    expectSecretEquals(read.items[0]?.value, name, 'NAME read with spaces around the user ID');

    // Same ID in capitals, and the ID with one extra letter: both are other (empty) users.
    for (const other of [userId.toUpperCase(), `${userId}x`]) {
      expectError(
        await aisle.readPii({ user_id: other, field_names: [PII_FIELDS.NAME] }),
        404,
        ERROR_CODES.PII_NOT_FOUND,
      );
    }

    const spacedUser = data.userId('wr12s');
    const save = await aisle.writePii({ user_id: ` ${spacedUser} `, field: PII_FIELDS.NAME, value: name });
    cleanup.leaveBehind('PII NAME', spacedUser);
    const saved = expectSuccess(save, 201, writePiiDataSchema);
    expect(saved.user_id, 'save reply names the trimmed user ID').toBe(spacedUser);
    expectSecretEquals(
      await readValue(aisle, { userId: spacedUser, field: PII_FIELDS.NAME }),
      name,
      'NAME saved with a spaced user ID is found under the trimmed ID',
    );
  });

  test('AISLE-WR-013 Attack-looking text in a name or a user ID is never run as code: it is stored and read back exactly', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved(
      '2026-10-01',
      'script-, NoSQL-, SQL- and path-like user IDs and script/NoSQL-like names round-trip unchanged',
    );
    noteAssumption(
      'BQ-35',
      'names with SQL-like or path-like text cannot be tested: the edge firewall in front of the facade refuses them (403) before they reach the PII service',
    );
    for (const value of ['QA <script>alert(1)</script>', 'QA {"$ne":null}']) {
      const userId = data.userId('wr13');
      const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value });
      cleanup.leaveBehind('PII NAME', userId);
      expectSuccess(res, 201, writePiiDataSchema);
      expectSecretEquals(
        await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
        value,
        'attack-looking NAME',
      );
    }
    for (const suffix of ["' OR '1'='1", '<script>x</script>', '{"$ne":null}', '/../../x']) {
      const userId = `${data.userId('wr13u')}${suffix}`;
      const name = data.name();
      const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: name });
      cleanup.leaveBehind('PII NAME', userId);
      const saved = expectSuccess(res, 201, writePiiDataSchema);
      expect(saved.user_id === userId, 'attack-looking user ID stored exactly').toBe(true);
      expectSecretEquals(
        await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
        name,
        'NAME under odd user ID',
      );
    }
  });

  test('AISLE-WR-014 Names with accents, Chinese characters, emoji and right-to-left script are stored and read back exactly', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'accents, CJK, emoji and Arabic names round-trip unchanged');
    const names = ['QA Ünïcödé Ågård', 'QA 测试用户', 'QA Emoji 😀🎉', 'QA مستخدم تجريبي', 'QA Zoë Ørsted'];
    for (const value of names) {
      const userId = data.userId('wr14');
      expectSuccess(
        await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value }),
        201,
        writePiiDataSchema,
      );
      cleanup.leaveBehind('PII NAME', userId);
      expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.NAME }), value, 'unicode NAME');
    }
  });

  test('AISLE-WR-015 A name of exactly 1,024 Chinese characters or 1,024 emoji is accepted: the limit counts characters, not bytes', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', '1,024 CJK characters (3,072 bytes) and 1,024 emoji (4,096 bytes) → 201');
    for (const ch of ['测', '😀']) {
      const userId = data.userId('wr15');
      const value = ch.repeat(LIMITS.value.max);
      expectSuccess(
        await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value }),
        201,
        writePiiDataSchema,
      );
      cleanup.leaveBehind('PII NAME', userId);
      expectSecretEquals(
        await readValue(aisle, { userId, field: PII_FIELDS.NAME }),
        value,
        '1,024-character NAME',
      );
    }
  });

  test('AISLE-WR-016 A name of 1,025 Chinese characters or 1,025 emoji is rejected (422) and nothing is saved', async ({
    aisle,
    data,
  }) => {
    noteObserved('2026-10-01', '1,025 CJK characters or emoji → 422 string_too_long');
    for (const ch of ['测', '😀']) {
      const userId = data.userId('wr16');
      const res = await aisle.call('writePii', {
        user_id: userId,
        field: PII_FIELDS.NAME,
        value: ch.repeat(LIMITS.value.max + 1),
      });
      expectValidationError(res, 'value');
      await expectNotPersisted(aisle, { userId, field: PII_FIELDS.NAME });
    }
  });

  test('AISLE-WR-017 A save with null instead of the value, the user ID or the field name is rejected (422) naming that part', async ({
    aisle,
    data,
  }) => {
    noteObserved('2026-10-01', 'null value / user_id / field → 422 string_type on that field');
    const userId = data.userId('wr17');
    expectValidationError(
      await aisle.call('writePii', { user_id: userId, field: PII_FIELDS.NAME, value: null }),
      'value',
    );
    expectValidationError(
      await aisle.call('writePii', { user_id: null, field: PII_FIELDS.NAME, value: data.name() }),
      'user_id',
    );
    expectValidationError(
      await aisle.call('writePii', { user_id: userId, field: null, value: data.name() }),
      'field',
    );
    await expectNotPersisted(aisle, { userId, field: PII_FIELDS.NAME });
  });

  test('AISLE-WR-018 Field names are not case-sensitive: “name” and “Email” are saved as NAME and EMAIL and can be read and bulk read in any case', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'lower/mixed-case field names are accepted and stored upper-case');
    const userId = data.userId('wr18');
    const name = data.name();
    const save = await aisle.writePii({ user_id: userId, field: 'name', value: name });
    cleanup.leaveBehind('PII NAME', userId);
    expect(expectSuccess(save, 201, writePiiDataSchema).field).toBe(PII_FIELDS.NAME);

    const read = expectSuccess(
      await aisle.readPii({ user_id: userId, field_names: ['name'] }),
      200,
      readPiiDataSchema,
    );
    expect(read.items.map((i) => i.field)).toEqual([PII_FIELDS.NAME]);
    expectSecretEquals(read.items[0]?.value, name, 'NAME read as "name"');

    const bulk = expectSuccess(
      await aisle.batchRead({ user_ids: [userId], fields: ['name'] }),
      200,
      batchReadDataSchema,
    );
    expectSecretEquals(bulk.items[0]?.value, name, 'NAME bulk read as "name"');

    const emailUser = data.userId('wr18e');
    const email = await aisle.writePii({ user_id: emailUser, field: 'Email', value: data.email('wr18') });
    blockIfAccessDenied(email, BLOCKERS.email.id, BLOCKERS.email.reason);
    cleanup.leaveBehind('PII EMAIL', emailUser);
    expect(expectSuccess(email, 201, writePiiDataSchema).field).toBe(PII_FIELDS.EMAIL);
  });

  test('AISLE-WR-020 Saving exactly the same value again succeeds (200) and the key version stays 1, also after a real replace', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption(
      'BQ-29',
      'observed 2026-10-01: key_version is 1 on create, repeat and replace; what key_version means is open',
    );
    const userId = data.userId('wr21');
    const name = data.name();
    const first = await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });
    expect(first.key_version).toBe(1);

    const again = expectSuccess(
      await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: name }),
      200,
      writePiiDataSchema,
    );
    expect(again.key_version, 'key version after saving the same value').toBe(1);

    const replaced = expectSuccess(
      await aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value: data.name() }),
      200,
      writePiiDataSchema,
    );
    expect(replaced.key_version, 'key version after replacing the value').toBe(1);
  });

  test('AISLE-WR-021 Five saves sent at the same moment for one user all succeed and leave exactly one of the five names', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', '5 parallel saves → one 201 and four 200; the final value is one of them');
    const userId = data.userId('wr22');
    const names = Array.from({ length: 5 }, () => data.name());
    const replies = await Promise.all(
      names.map((value) => aisle.writePii({ user_id: userId, field: PII_FIELDS.NAME, value })),
    );
    cleanup.leaveBehind('PII NAME', userId);
    for (const res of replies) expectSuccess(res, [201, 200], writePiiDataSchema);

    const read = expectSuccess(
      await aisle.readPii({ user_id: userId, field_names: [PII_FIELDS.NAME] }),
      200,
      readPiiDataSchema,
    );
    expect(read.count, 'exactly one stored NAME').toBe(1);
    expect(names.includes(read.items[0]?.value ?? ''), 'final NAME is one of the five sent').toBe(true);
  });

  test('AISLE-WR-022 Email lifecycle: save a fake email (201), replace it (200), read back the new email', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'EMAIL save 201, replace 200, read returns the new email');
    const userId = data.userId('wr23');
    const first = data.email('wr23a');
    const second = data.email('wr23b');
    const save = await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: first });
    blockIfAccessDenied(save, BLOCKERS.email.id, BLOCKERS.email.reason);
    cleanup.leaveBehind('PII EMAIL', userId);
    expectSuccess(save, 201, writePiiDataSchema);

    expectSuccess(
      await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: second }),
      200,
      writePiiDataSchema,
    );
    expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.EMAIL }), second, 'replaced EMAIL');
  });

  test('AISLE-WR-023 Valid but unusual emails (a “+tag” and a sub-domain) are accepted and read back unchanged', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'plus-tag and sub-domain emails → 201 and read back unchanged');
    const base = data.email('wr24');
    const [local, domain] = base.split('@') as [string, string];
    for (const email of [`${local}+tag@${domain}`, `${local}.sub@mail.${domain}`]) {
      const userId = data.userId('wr24');
      const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: email });
      blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
      cleanup.leaveBehind('PII EMAIL', userId);
      expectSuccess(res, 201, writePiiDataSchema);
      expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.EMAIL }), email, 'unusual EMAIL');
    }
  });

  test('AISLE-WR-024 Badly formed emails (two “@”, no domain, no name part, a space inside, a trailing dot) are rejected and nothing is saved', async ({
    aisle,
    data,
  }) => {
    blockedBy(
      'BQ-37',
      'EMAIL format rules not defined: on 2026-10-01 all these badly formed emails were saved (201); only a missing "@" is refused',
    );
    const [local, domain] = data.email('wr25').split('@') as [string, string];
    for (const bad of [
      `${local}@x@${domain}`,
      `${local}@`,
      `@${domain}`,
      `${local} x@${domain}`,
      `${local}@${domain}.`,
    ]) {
      const userId = data.userId('wr25');
      const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: bad });
      expectError(res, 400, ERROR_CODES.VALIDATION_ERROR);
      await expectNotPersisted(aisle, { userId, field: PII_FIELDS.EMAIL });
    }
  });

  test('AISLE-WR-025 Long emails of 254, 255 and 1,024 characters are accepted: EMAIL uses the general 1,024-character limit', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteAssumption(
      'BQ-37',
      'observed 2026-10-01: EMAIL has no 254-character limit, only the general 1,024; Dev to confirm',
    );
    for (const length of [254, 255, LIMITS.value.max]) {
      const userId = data.userId('wr26');
      const email = longEmail(data.email('wr26'), length);
      expect(email).toHaveLength(length);
      const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: email });
      blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
      cleanup.leaveBehind('PII EMAIL', userId);
      expectSuccess(res, 201, writePiiDataSchema);
    }
  });

  test('AISLE-WR-026 An email of 1,025 characters is rejected (422) and nothing is saved', async ({
    aisle,
    data,
  }) => {
    noteObserved('2026-10-01', '1,025-character EMAIL → 422 string_too_long');
    const userId = data.userId('wr27');
    const res = await aisle.call('writePii', {
      user_id: userId,
      field: PII_FIELDS.EMAIL,
      value: longEmail(data.email('wr27'), LIMITS.value.max + 1),
    });
    expectValidationError(res, 'value');
    await expectNotPersisted(aisle, { userId, field: PII_FIELDS.EMAIL });
  });

  test('AISLE-WR-027 Adding an email to a user who already has a name is a new save (201), and the name is kept', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved('2026-10-01', 'first EMAIL for a user who has a NAME → 201');
    const userId = data.userId('wr28');
    const name = data.name();
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });

    const res = await aisle.writePii({ user_id: userId, field: PII_FIELDS.EMAIL, value: data.email('wr28') });
    blockIfAccessDenied(res, BLOCKERS.email.id, BLOCKERS.email.reason);
    cleanup.leaveBehind('PII EMAIL', userId);
    expectSuccess(res, 201, writePiiDataSchema);
    expectSecretEquals(await readValue(aisle, { userId, field: PII_FIELDS.NAME }), name, 'NAME kept');
  });

  test('AISLE-WR-028 A phone next to a name and an email: replacing the phone, reading all three fields and bulk reading the phone', async ({
    aisle,
    data,
    cleanup,
    config,
  }) => {
    requireApprovedPhones(config);
    noteObserved(
      '2026-10-01',
      'PHONE save 201, replace 200; read of 3 fields → count 3; bulk PHONE → the new phone',
    );
    const userId = data.userId('wr28');
    const name = data.name();
    const email = data.email('wr28');
    const [first, second] = [data.phone(0), data.phone(1)];
    await seedField(aisle, cleanup, { userId, field: PII_FIELDS.NAME, value: name });
    await seedField(aisle, cleanup, {
      userId,
      field: PII_FIELDS.EMAIL,
      value: email,
      blocker: BLOCKERS.email,
    });

    expectSuccess(
      await aisle.writePii({ user_id: userId, field: PII_FIELDS.PHONE, value: first.input }),
      201,
      writePiiDataSchema,
    );
    cleanup.leaveBehind('PII PHONE', userId);
    expectSuccess(
      await aisle.writePii({ user_id: userId, field: PII_FIELDS.PHONE, value: second.input }),
      200,
      writePiiDataSchema,
    );

    const read = expectSuccess(
      await aisle.readPii({
        user_id: userId,
        field_names: [PII_FIELDS.NAME, PII_FIELDS.EMAIL, PII_FIELDS.PHONE],
      }),
      200,
      readPiiDataSchema,
    );
    expect(read.count).toBe(3);
    expectSecretEquals(read.items.find((i) => i.field === PII_FIELDS.NAME)?.value, name, 'NAME');
    expectSecretEquals(read.items.find((i) => i.field === PII_FIELDS.EMAIL)?.value, email, 'EMAIL');
    expectSecretEquals(
      read.items.find((i) => i.field === PII_FIELDS.PHONE)?.value,
      second.normalized,
      'replaced PHONE',
    );

    const bulk = expectSuccess(
      await aisle.batchRead({ user_ids: [userId], fields: [PII_FIELDS.PHONE] }),
      200,
      batchReadDataSchema,
    );
    expect(bulk.count).toBe(1);
    expectSecretEquals(bulk.items[0]?.value, second.normalized, 'bulk-read PHONE');
  });

  test('AISLE-WR-029 Ten saves for ten different fake users sent at the same moment all succeed (201) and each user gets their own name', async ({
    aisle,
    data,
    cleanup,
  }) => {
    noteObserved(
      '2026-10-01',
      '10 parallel saves for different users → ten 201s; bulk read returns each name',
    );
    const users = Array.from({ length: 10 }, () => ({ userId: data.userId('wr29'), name: data.name() }));
    const replies = await Promise.all(
      users.map((u) => aisle.writePii({ user_id: u.userId, field: PII_FIELDS.NAME, value: u.name })),
    );
    users.forEach((u) => cleanup.leaveBehind('PII NAME', u.userId));
    for (const res of replies) expectSuccess(res, 201, writePiiDataSchema);

    const bulk = expectSuccess(
      await aisle.batchRead({ user_ids: users.map((u) => u.userId), fields: [PII_FIELDS.NAME] }),
      200,
      batchReadDataSchema,
    );
    expect(bulk.count).toBe(10);
    for (const u of users)
      expectSecretEquals(
        bulk.items.find((i) => i.user_id === u.userId)?.value,
        u.name,
        'parallel-saved NAME',
      );
  });
});

/** A fake email of exactly `length` characters: the domain part is padded (still under the test domain). */
function longEmail(seed: string, length: number): string {
  const [local, domain] = seed.split('@') as [string, string];
  const padding = length - local.length - 1 - domain.length - 1;
  return `${local}@${'d'.repeat(Math.max(1, padding))}.${domain}`;
}
