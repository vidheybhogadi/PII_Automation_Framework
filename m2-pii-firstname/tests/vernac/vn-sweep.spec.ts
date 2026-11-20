/**
 * M2FN-VSWP-001 — the vernac sweep: one test per callable Vernac / Vernac CMS inventory row without a deep case
 * (m2-pii-firstname/scripts/m2fn-vernac-sweep.ts). The member’s name in the reply must equal its CMS view (PII getter).
 * With M2FN_VN_RUN=true and a member that already has a PII name, the member is made divergent first (and restored),
 * so a Postgres-based reply is caught. Relation rows use only relations that already exist (M2FNQ-34); a missing
 * relation blocks the row with its reason. Rows that cannot be called are listed on the workbook’s "Sweep Rows" sheet.
 */
import { blockPrereq } from '../../../m2/src/prereq';
import { fnRows } from '../../scripts/m2fn-design';
import { VN_SWEEP, type VnSweepRow } from '../../scripts/m2fn-vernac-sweep';
import { record } from '../../src/first-name';
import { byId, mainPair, makeDivergent, vnNameOf, vnParamScenario } from '../../src/vn/define';
import { expect, type VnCtx } from '../../src/vn/fixtures';
import type { VnRoute } from '../../src/vn/client';
import { usable, writable, type TeamUser } from '../../src/vn/team';

const ROWS = new Map(fnRows().map((r) => [r.id, r]));
const ID = 'M2FN-VSWP-001';

/** Caller and member of a row (existing relations only). */
async function parties(
  vn: VnCtx,
  s: VnSweepRow,
): Promise<{ caller: TeamUser; member: TeamUser; extra?: Record<string, string> }> {
  if (s.how === 'own' || s.how === 'own-edit') {
    const { d } = mainPair(vn);
    return { caller: d, member: d };
  }
  if (s.relation === 'invite-received') {
    for (const i of vn.team.invites) {
      const caller = byId(vn, i.b);
      const member = byId(vn, i.a);
      if (caller && member && usable(caller) && usable(member)) return { caller, member };
    }
    return blockPrereq(
      'M2FNQ-34',
      'No existing invite between two team users (no new relations, QA lead 2026-11-11)',
    );
  }
  if (s.relation === 'conversation' || s.relation === 'conversation-cms') {
    // The active list shows full conversations, the linked list the others: matching ones first.
    const want = s.conversation;
    const convs = want
      ? [...vn.team.conversations].sort(
          (x, y) => Number(y.full === (want === 'full')) - Number(x.full === (want === 'full')),
        )
      : vn.team.conversations;
    for (const c of convs) {
      const a = byId(vn, c.a);
      const b = byId(vn, c.b);
      if (!a || !b || !usable(a) || !usable(b)) continue;
      // A member whose name is not hidden first (a hidden name shows only its initial in chat lists).
      const [caller, member] =
        writable(b) && !b.hide ? [a, b] : writable(a) && !a.hide ? [b, a] : writable(b) ? [a, b] : [b, a];
      return {
        caller,
        member,
        ...(s.relation === 'conversation-cms'
          ? { extra: { current_user_ref: caller.ref!, other_user_ref: member.ref!, page: '1' } }
          : {}),
      };
    }
    return blockPrereq('M2FNQ-34', 'No existing conversation between two team users');
  }
  if (s.relation === 'connected-partner') {
    // The listed user’s connections are all team users (DB count); the name checked is the partner’s.
    for (const c of vn.team.conversations)
      for (const [id, partnerId] of [
        [c.a, c.b],
        [c.b, c.a],
      ] as const) {
        const u = byId(vn, id);
        const partner = byId(vn, partnerId);
        if (!u || !partner || !usable(u) || !usable(partner)) continue;
        const counts =
          (
            await vn.db.appQuery<Record<string, number>>('foreignRelationCounts', [
              [...vn.db.suite],
              u.userId,
            ])
          )[0] ?? {};
        if (Number(counts.conversations ?? 1) === 0)
          return { caller: u, member: partner, extra: { ref: u.ref! } };
      }
    return blockPrereq('M2FNQ-34', 'No team user whose connections are all with team users');
  }
  // all-partners-suite: a team user whose conversations are all with team users (DB counts, partners never selected)
  for (const c of vn.team.conversations)
    for (const id of [c.a, c.b]) {
      const u = byId(vn, id);
      if (!u || !usable(u)) continue;
      const counts =
        (
          await vn.db.appQuery<Record<string, number>>('foreignRelationCounts', [[...vn.db.suite], u.userId])
        )[0] ?? {};
      if (Number(counts.conversations ?? 1) === 0) return { caller: u, member: u, extra: { ref: u.ref! } };
      record(`${u.label}: has conversations with non-team members — not called`);
    }
  return blockPrereq('M2FNQ-34', 'No team user whose connections are all with team users');
}

for (const s of VN_SWEEP.filter((x) => x.cls !== 'cannot')) {
  const r = ROWS.get(s.row)!;
  const [method, path] = s.route!;
  vnParamScenario(ID, `${s.row} ${method} ${path}`, async (vn) => {
    const { caller, member, extra } = await parties(vn, s);
    let div: { db: string; pii: string } | undefined;
    if (vn.cfg.run && writable(member)) div = await makeDivergent(vn, member);
    const expected = await vn.cmsName(member);
    const route: VnRoute = { key: r.id, method, path, ...(path.startsWith('/admin/') ? { cms: true } : {}) };
    const body = method === 'POST' ? {} : undefined;
    const res =
      s.how === 'cms-member'
        ? await vn.asAdmin(route, member.app, { query: extra ?? { ref: member.ref! } })
        : await vn.asUser(caller, route, { ...(body ? { body } : {}), ...(extra ? { query: extra } : {}) });
    if (res.status >= 500) throw new Error(`${s.row}: HTTP ${res.status}`);
    if (res.status >= 400) return blockPrereq('M2FN-SWEEP', `${s.row} answered HTTP ${res.status}`);
    const j = res.json();
    const name =
      vnNameOf(j, member.ref!) ??
      (caller === member ? ((j as Record<string, unknown> | undefined)?.first_name ?? undefined) : undefined);
    if (name === undefined)
      return blockPrereq('M2FN-SWEEP', `${s.row}: the reply does not list the member (relation state)`);
    expect(name, `${s.row}: the member’s name = its CMS view (PII getter)`).toBe(expected);
    if (div) expect(name === div.db, `${s.row}: never the Postgres double-space form`).toBe(false);
  });
}
