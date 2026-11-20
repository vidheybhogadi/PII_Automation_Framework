/**
 * Setup steps that create team-account state a vernac case needs (QA lead 2026-11-12, "proceed with all remaining"):
 *
 *  - createTeamLike — one like between two team users IN THE SAME APP, so a member that already has a PII name is
 *    listed in the viewer’s sent-likes list (M2FN-VLST-001 / 002 / 004). Created once per run and reused.
 *  - ensureMessageFrom — one fake chat message from D in an existing team-only conversation (M2FN-VHID-003), sent
 *    only when the conversation has no message from D yet.
 *
 * Both cannot be undone (a like also sends a "like received" push to the team phone; a message is stored for the
 * partner). Each is recorded with VnCtx.irreversible (labels and apps only). Rules kept: only the nine team users
 * (discovered by the read-only DB lookup), only M2FN_VN_RUN=true, never a new user, never a non-team member — the
 * viewer must have no likes sent to non-team members (DB count) so its list shows team users only, and the pair must
 * have no relation yet in either direction (a like back would make a match).
 */
import { blockPrereq } from '../../../m2/src/prereq';
import { VN } from './client';
import { VN_BLOCK, type VnCtx } from './fixtures';
import type { VnApp } from './guard';
import { usable, writable, type TeamUser } from './team';

const APP_ORDER: VnApp[] = ['Arike', 'Neene', 'Neetho', 'Anbe'];

/** Any like / pass / invite / block / conversation between x and y, in either direction. */
function related(vn: VnCtx, x: TeamUser, y: TeamUser): boolean {
  const t = vn.team;
  const pair = (p: { a: string; b: string }) =>
    (p.a === x.userId && p.b === y.userId) || (p.a === y.userId && p.b === x.userId);
  return [t.likes, t.passes, t.invites, t.blocks, t.conversations].some((list) =>
    (list as { a: string; b: string }[]).some(pair),
  );
}

async function likesToOthers(vn: VnCtx, u: TeamUser): Promise<number> {
  const r = (
    await vn.db.appQuery<Record<string, unknown>>('foreignRelationCounts', [[...vn.db.suite], u.userId])
  )[0];
  return Number(r?.likes_sent ?? 1);
}

/**
 * Create one like viewer → member between two approved team users of the same app. The member already has a PII name
 * (and a verified selfie when `needVerified`); members whose name is not hidden come first. Blocks with the reason
 * when no such pair exists or the like is not recorded.
 */
export async function createTeamLike(
  vn: VnCtx,
  need: { needVerified?: boolean } = {},
): Promise<{ viewer: TeamUser; about: TeamUser }> {
  if (!vn.cfg.run)
    blockPrereq(VN_BLOCK.run, 'Creating a like between team users runs only with M2FN_VN_RUN=true');
  for (const app of APP_ORDER.filter((x) => vn.cfg.apps.includes(x))) {
    const abouts = vn.team.users
      .filter(
        (u) =>
          u.app === app && writable(u) && u.state === 'approved' && (!need.needVerified || u.selfieVerified),
      )
      .sort((x, y) => Number(x.hide) - Number(y.hide) || y.number.localeCompare(x.number));
    for (const about of abouts) {
      const viewers = vn.team.users
        .filter(
          (u) =>
            u.app === app && u !== about && usable(u) && u.state === 'approved' && !related(vn, u, about),
        )
        .sort((x, y) => y.number.localeCompare(x.number));
      for (const viewer of viewers) {
        if ((await likesToOthers(vn, viewer)) !== 0) continue;
        const res = await vn.asUser(viewer, VN.like, { body: { ref: about.ref! } });
        if (res.status !== 200)
          throw new Error(`POST /v1/like as ${viewer.label} (${app}): HTTP ${res.status}`);
        await vn.refreshLikes();
        const made = vn.team.likes.find((l) => l.a === viewer.userId && l.b === about.userId);
        if (!made)
          return blockPrereq(
            VN_BLOCK.state,
            `${app}: POST /v1/like ${viewer.label} → ${about.label} answered 200 but no like was recorded (no likes left for the viewer, or the member has a boost so it became an invite)`,
          );
        vn.irreversible(
          app,
          `like created ${viewer.label} → ${about.label} (POST /v1/like; cannot be undone; "like received" push to ${about.label})`,
        );
        return { viewer, about };
      }
    }
  }
  return blockPrereq(
    VN_BLOCK.state,
    `No app has an approved team user with a PII name${need.needVerified ? ' and a verified selfie' : ''} plus an approved team user without any relation to it and without likes to non-team members`,
  );
}

type Obj = Record<string, unknown>;

/** Every message object (any depth) that carries a sender_ref_id. */
export function chatMessagesOf(body: unknown, out: Obj[] = []): Obj[] {
  if (!body || typeof body !== 'object') return out;
  if (Array.isArray(body)) {
    for (const x of body) chatMessagesOf(x, out);
    return out;
  }
  const o = body as Obj;
  if ('sender_ref_id' in o) out.push(o);
  else for (const v of Object.values(o)) chatMessagesOf(v, out);
  return out;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** chat_messages as `viewer` (messages older than one second only, chat/message.rb:57). */
export async function readChat(vn: VnCtx, viewer: TeamUser, conversationId: string) {
  const res = await vn.asUser(viewer, VN.chatMessages, { body: { conversation_id: conversationId } });
  return { status: res.status, messages: res.status === 200 ? chatMessagesOf(res.json()) : [] };
}

/**
 * Make sure the conversation holds a message from `d`: read it as `a`; when there is none, send one fake text message
 * as `d` (POST /v1/chat/send_message {ref, text}; letters only, so the spam check never sees a phone number) and read
 * again. Returns `a`’s view of the messages; blocks when chat_messages fails or the message does not appear.
 */
export async function ensureMessageFrom(
  vn: VnCtx,
  d: TeamUser,
  a: TeamUser,
  conv: { id: string; full: boolean },
): Promise<Obj[]> {
  const first = await readChat(vn, a, conv.id);
  if (first.status !== 200)
    return blockPrereq('M2FNQ-54', `POST /v1/chat/chat_messages answered HTTP ${first.status}`);
  if (first.messages.some((m) => m.sender_ref_id === d.ref)) return first.messages;
  if (!vn.cfg.run)
    blockPrereq(VN_BLOCK.run, 'Sending a chat message between team users runs only with M2FN_VN_RUN=true');
  const text = `Qa fake test message ${vn.runId.replace(/[^a-z]/gi, '').slice(-8)}`.trim();
  const sent = await vn.asUser(d, VN.sendMessage, { body: { ref: a.ref!, text } });
  if (sent.status !== 200)
    throw new Error(`POST /v1/chat/send_message as ${d.label} (${d.app}): HTTP ${sent.status}`);
  await pause(2500);
  const again = await readChat(vn, a, conv.id);
  if (!again.messages.some((m) => m.sender_ref_id === d.ref))
    return blockPrereq(
      VN_BLOCK.state,
      `${d.app}: the message from ${d.label} did not appear in chat_messages (a linked conversation turns active only when the sender is female or subscribed, chat/conversation.rb:100-116)`,
    );
  vn.irreversible(
    d.app,
    `chat message sent ${d.label} → ${a.label} in a team-only conversation (POST /v1/chat/send_message; cannot be undone${conv.full ? '' : '; the linked conversation became an active one'})`,
  );
  return again.messages;
}
