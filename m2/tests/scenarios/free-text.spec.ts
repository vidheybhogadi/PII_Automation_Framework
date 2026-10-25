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
import { extendTestTimeout, type Profile } from '../../src/accounts/accounts';

const text = (fx: Fx, label: string) => `FT_${fx.m2Config.runId}_${label}`;

/** A sends a chat message to B (Dev cURL shape; tokens unique per run). */
async function sendMessage(fx: Fx, a: Profile, b: Profile, body: string) {
  return call(fx, 'API-187', asUser(fx, a, b), {
    values: { REF: b.ref, MESSAGE_TIME_TOKEN: `${Date.now()}`, ACTION_TIME_TOKEN: `${Date.now()}` },
    synthetic: { freeText: body },
  });
}

/**
 * chat_messages returns the messages OLDER than the request's created_at, 10 per page (chat/message.rb:47, 57,
 * develop_new 944f76a — from code, confirm with Dev); Dev's example date is in the past, so a just-sent message would
 * never be listed. The cursor is set 5 minutes in the future (format %Y-%m-%dT%H:%M:%SZ).
 */
const futureCursor = () => new Date(Date.now() + 5 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** One chat_messages page for `viewer` (conversation id from the suite pair, or `conversationId` when given). */
async function chat(fx: Fx, viewer: Profile, other: Profile, page = 1, conversationId?: string) {
  const caller = asUser(fx, viewer, other);
  if (conversationId) caller.values = { ...caller.values, CONVERSATION_ID: conversationId };
  const body = await devBody(fx, 'API-069', caller);
  setDeep(body, 'created_at', futureCursor());
  setDeep(body, 'page', page);
  return call(fx, 'API-069', caller, { body });
}

/** Messages are saved asynchronously (ChatMessageWorker): read pages 1…pages until `done` holds, up to ~30 s. */
async function readChatUntil(
  fx: Fx,
  viewer: Profile,
  other: Profile,
  done: (text: string) => boolean,
  pages = 1,
): Promise<string> {
  extendTestTimeout(CHAT_SAVE_WAIT_MS + 15_000); // the poll gets its own time on top of the test's
  const start = Date.now();
  for (;;) {
    let all = '';
    for (let page = 1; page <= pages; page++) all += (await chat(fx, viewer, other, page)).rawText();
    if (done(all) || Date.now() - start >= CHAT_SAVE_WAIT_MS) return all;
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

const CHAT_SAVE_WAIT_MS = 30_000;

test.describe('M2 scenarios — free text', () => {
  scenario('M2-FT-001', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const t = text(fx, 'chat hello');
    expectOk(await sendMessage(fx, a, b, t), 'A sends');
    const has = (text: string) => text.includes(t);
    expect(has(await readChatUntil(fx, b, a, has)), 'B reads the exact text').toBe(true);
    await call(fx, 'API-063', asUser(fx, b, a));
    expect(has(await readChatUntil(fx, a, b, has)), 'A reads the same text').toBe(true);
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
    // 25 messages at 10 per page: pages 1–3, cursor in the future, polled while the messages are saved.
    const all = await readChatUntil(fx, b, a, (text) => texts.every((t) => text.includes(t)), 3);
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
      const has = (text: string) => text.includes(JSON.stringify(t).slice(1, -1));
      expect(has(await readChatUntil(fx, b, a, has)), 'identical text for the other user').toBe(true);
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
    // C asks for the A–B conversation BY ITS ID (taken from the pair — an IDOR-style read), after the message is
    // readable by B; without the pair's id this part cannot be sent.
    const has = (body: string) => body.includes(t);
    noteEvidence(
      `B (a member) ${has(await readChatUntil(fx, b, a, has)) ? 'reads' : 'does not read (yet)'} the text before C asks.`,
    );
    const conversationId = await fx.accounts.pairConversationId();
    if (!conversationId)
      blockPrereq(
        PREREQ.connected.id,
        'The A–B conversation id is only known for the suite’s own connected pair (M2_CREATE_ACCOUNTS=true)',
      );
    for (const res of [await chat(fx, c, a, 1, conversationId), await call(fx, 'API-063', asUser(fx, c))])
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
