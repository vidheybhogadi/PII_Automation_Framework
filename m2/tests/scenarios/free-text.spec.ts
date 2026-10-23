/**
 * Scenario cases — free text (M2-FT-*): chat text / previous_message and bio are encrypted by the app with PII
 * free-text keys (Dev list 2026-10-23). Texts are synthetic and carry the run marker FT_<run>.
 */
import { PII_KEYS, scanResponse } from '../../src/assertions/pii.assertions';
import { scenario } from '../../src/checks/define';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import {
  asUser,
  call,
  devBody,
  expectOk,
  requireOwnOnboardedAccount,
  setDeep,
  type Fx,
} from '../../src/scenarios/helpers';
import type { Profile } from '../../src/accounts/accounts';

const text = (fx: Fx, label: string) => `FT_${fx.m2Config.runId}_${label}`;

/** A sends a chat message to B (Dev cURL shape; tokens unique per run). */
async function sendMessage(fx: Fx, a: Profile, b: Profile, body: string) {
  return call(fx, 'API-187', asUser(fx, a, b), {
    values: { REF: b.ref, MESSAGE_TIME_TOKEN: `${Date.now()}`, ACTION_TIME_TOKEN: `${Date.now()}` },
    synthetic: { freeText: body },
  });
}

const chat = (fx: Fx, viewer: Profile, other: Profile) => call(fx, 'API-069', asUser(fx, viewer, other));

test.describe('M2 scenarios — free text', () => {
  scenario('M2-FT-001', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const t = text(fx, 'chat hello');
    expectOk(await sendMessage(fx, a, b, t), 'A sends');
    expect((await chat(fx, b, a)).rawText().includes(t), 'B reads the exact text').toBe(true);
    await call(fx, 'API-063', asUser(fx, b, a));
    expect((await chat(fx, a, b)).rawText().includes(t), 'A reads the same text').toBe(true);
  });

  scenario('M2-FT-002', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const bio = text(fx, 'this is my bio');
    expectOk(await call(fx, 'API-121', asUser(fx, a), { synthetic: { freeText: bio } }), 'save bio');
    expect(
      (await call(fx, 'API-119', asUser(fx, a))).rawText().includes(bio),
      'owner reads the exact bio',
    ).toBe(true);
    await call(fx, 'API-021', asUser(fx, b, a), { values: { REF: a.ref } });
    noteEvidence('Which app reads return the bio to viewers: M2Q-27.');
  });

  scenario('M2-FT-003', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const b2 = text(fx, 'bio two');
    for (let i = 0; i < 2; i++) {
      expectOk(await call(fx, 'API-121', asUser(fx, a), { synthetic: { freeText: b2 } }), 'save B2');
      expect((await call(fx, 'API-119', asUser(fx, a))).rawText().includes(b2), 'owner sees B2').toBe(true);
      expect(
        (await call(fx, 'API-119', asUser(fx, b, a), { query: { ref: a.ref! } })).rawText().includes(b2),
        'viewer sees B2',
      ).toBe(true);
    }
  });

  scenario('M2-FT-004', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const texts = Array.from({ length: 25 }, (_, i) => text(fx, `msg-${String(i).padStart(2, '0')}`));
    for (const t of texts) expectOk(await sendMessage(fx, a, b, t), 'send');
    let all = '';
    for (let page = 1; page <= 5; page++) {
      const body = devBody(fx, 'API-069', asUser(fx, b, a));
      setDeep(body, 'page', page);
      all += (await call(fx, 'API-069', asUser(fx, b, a), { body })).rawText();
    }
    for (const t of texts) expect(all.includes(t), 'every text intact across pages').toBe(true);
  });

  scenario('M2-FT-005', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    for (const special of [
      '😀👨‍👩‍👧',
      'नमस्ते தமிழ் বাংলা',
      'שלום',
      'line1\nline2\r\nline3\ttab',
      '<b>x</b><script>y</script>',
      '{"json":"like"}',
      'quote " and \\ backslash',
    ]) {
      const t = `${text(fx, 'special')} ${special}`;
      expectOk(await sendMessage(fx, a, b, t), 'send');
      expect(
        (await chat(fx, b, a)).rawText().includes(JSON.stringify(t).slice(1, -1)),
        'identical text for the other user',
      ).toBe(true);
    }
  });

  scenario('M2-FT-006', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    for (const value of [null, '', '   ', 12345, ['a']]) {
      const res = await call(fx, 'API-187', asUser(fx, a, b), {
        values: { REF: b.ref },
        body: { ref: b.ref, text: value },
      });
      expect(res.status < 500, 'no server error').toBe(true);
    }
  });

  scenario('M2-FT-007', async (fx) => {
    const [a, b, c] = await fx.accounts.trio();
    const t = text(fx, 'pair only');
    expectOk(await sendMessage(fx, a, b, t), 'A sends to B');
    for (const res of [await chat(fx, c, a), await call(fx, 'API-063', asUser(fx, c))])
      expect(res.rawText().includes(t), 'C never sees the A–B text').toBe(false);
    const post = await sendMessage(fx, c, b, text(fx, 'intruder'));
    expect(post.status >= 200 && post.status < 300, 'C cannot post to a ref it is not connected to').toBe(
      false,
    );
  });

  scenario('M2-FT-008', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    for (const apiId of ['API-069', 'API-063', 'API-119']) {
      const res = await call(fx, apiId, asUser(fx, b, a), { values: { REF: a.ref } });
      const keys = scanResponse(res, {
        allowKeys: PII_KEYS.filter(
          (k) => !['key_id', 'key_material', 'ciphertext', 'encrypted_value'].includes(k),
        ),
      }).filter(
        (f) =>
          f.kind === 'PII field with a value' &&
          /key_id|key_material|ciphertext|encrypted_value/.test(f.where),
      );
      expect(keys, `${apiId}: no ciphertext / key_id / key material in the reply`).toEqual([]);
      expect(/"(nonce|auth_tag)"/.test(res.rawText()), `${apiId}: no encryption metadata`).toBe(false);
    }
  });

  scenario('M2-FT-009', async () =>
    blockPrereq(PREREQ.states.id, `${PREREQ.states.reason} — legacy plaintext messages / bio`),
  );
  scenario('M2-FT-010', async () => blockPrereq(PREREQ.outage.id, PREREQ.outage.reason));
  scenario('M2-FT-011', async () => requireOwnOnboardedAccount());

  scenario('M2-FT-012', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const t = text(fx, 'twice');
    const token = `${Date.now()}`;
    for (let i = 0; i < 2; i++)
      await call(fx, 'API-187', asUser(fx, a, b), {
        values: { REF: b.ref, MESSAGE_TIME_TOKEN: token, ACTION_TIME_TOKEN: token },
        synthetic: { freeText: t },
      });
    noteEvidence('De-duplication rule for a repeated message_time_token: M2Q-30 (recorded).');
  });

  scenario('M2-FT-013', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const t = text(fx, 'timing');
    expectOk(await sendMessage(fx, a, b, t), 'send');
    const start = Date.now();
    let seen = false;
    while (!seen && Date.now() - start < 60_000) {
      seen = (await chat(fx, b, a)).rawText().includes(t);
      if (!seen) await new Promise((r) => setTimeout(r, 2_000));
    }
    noteEvidence(
      `Message ${seen ? `visible after ${Date.now() - start} ms` : 'not visible within 60 s'} (window: M2Q-30).`,
    );
  });

  scenario('M2-FT-014', async (fx) => fx.accounts.admin());
  scenario('M2-FT-015', async () =>
    blockPrereq('M2Q-27', 'Key granularity mapping is Dev-assisted (deferred free-text contract)'),
  );
});
