/**
 * Scenario cases — first name (M2-FNAME-*). Bodies follow the workbook steps; each case is blocked first by its
 * design status (open questions), then at runtime by any missing prerequisite (onboarded / connected accounts,
 * special account states, Dev windows). Expected results are asserted only where the design evidences them.
 */
import { isSuccess } from '../../src/assertions/pii.assertions';
import { restoreFirstName } from '../../src/checks/context';
import { scenario } from '../../src/checks/define';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import {
  asUser,
  call,
  devBody,
  editFirstName,
  expectOk,
  nameOf,
  otherUsersView,
  ownProfile,
  piiFirstName,
  profileByRef,
  refOf,
  requireOwnOnboardedAccount,
  setDeep,
  deleteDeep,
  submitProfile,
  testEmail,
  type Fx,
} from '../../src/scenarios/helpers';
import type { Profile } from '../../src/accounts/accounts';
import { maskedFirstName, normalizeFirstName } from '../../scripts/m2-code-evidence';

/** Own name (app) and PII name of a profile. */
async function names(fx: Fx, p: Profile) {
  return {
    app: nameOf(await ownProfile(fx, p)),
    pii: p.userId ? await piiFirstName(fx, p.userId) : undefined,
  };
}

/** How long M2-FNAME-017 polls for the new name (kept well under the test's timeout). */
const FNAME_017_POLL_MS = 40_000;

const LISTS = [
  'API-005',
  'API-006',
  'API-007',
  'API-008',
  'API-014',
  'API-015',
  'API-019',
  'API-020',
  'API-047',
  'API-048',
  'API-049',
  'API-054',
  'API-063',
  'API-068',
  'API-116',
  'API-126',
];

/** All list items (objects) carrying a ref, from any JSON body. */
function itemsWithRef(body: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(body)) body.forEach((b) => itemsWithRef(b, out));
  else if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if ('ref' in o) out.push(o);
    Object.values(o).forEach((v) => itemsWithRef(v, out));
  }
  return out;
}

test.describe('M2 scenarios — first name', () => {
  // Gate OFF (M2Q-02): the onboarding write lands in PII and the app; the gate-ON half waits for Dev (M2Q-43).
  scenario('M2-FNAME-001', async (fx) => {
    const name = fx.data.firstName();
    // A new account onboarded through the verified onboarding flow (submit_profile is the write under test).
    const p = await fx.accounts.onboardFresh({ firstName: name, email: testEmail(fx, 'fname001') });
    expect(nameOf(await ownProfile(fx, p)) === name, 'fetch_own_info returns the submitted name').toBe(true);
    const ref = await refOf(fx, p);
    const byRef = await call(fx, 'API-021', asUser(fx, p), { values: { REF: ref } });
    expect(nameOf(byRef) === name, 'own GET /V1/users/:ref returns the submitted name').toBe(true);
    expect((await piiFirstName(fx, p.userId!)) === name, 'PII first name = submitted name').toBe(true);
  });

  scenario('M2-FNAME-002', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    const before = await names(fx, p);
    await submitProfile(fx, p, { firstName: fx.data.firstName() });
    const after = await names(fx, p);
    expect(after.app === before.app, 'app name stays N1').toBe(true);
    expect(after.pii === before.pii, 'PII name stays N1').toBe(true);
  });

  scenario('M2-FNAME-003', async (fx) => {
    for (const apiId of ['API-061', 'API-129']) {
      const p = await fx.accounts.freshUser();
      const name = fx.data.firstName();
      expectOk(
        await submitProfile(fx, p, { firstName: name, email: testEmail(fx, 'fname003') }, apiId),
        apiId,
      );
      expect(nameOf(await ownProfile(fx, p)) === name, `${apiId}: own profile shows the name`).toBe(true);
      expect((await piiFirstName(fx, p.userId!)) === name, `${apiId}: PII first name saved`).toBe(true);
    }
  });

  scenario('M2-FNAME-004', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    const n2 = fx.data.firstName();
    expectOk(await editFirstName(fx, p, n2), 'edit');
    expect(nameOf(await ownProfile(fx, p)) === n2, 'fetch_own_info returns N2').toBe(true);
    expect(nameOf(await profileByRef(fx, p, p)) === n2, 'own /V1/users/:ref returns N2').toBe(true);
    expect((await piiFirstName(fx, p.userId!)) === n2, 'PII returns N2').toBe(true);
  });

  scenario('M2-FNAME-005', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    const n3 = fx.data.firstName();
    expectOk(await editFirstName(fx, p, n3, 'API-130'), 'web edit');
    const web = await call(fx, 'API-120', asUser(fx, p), { values: { REF: p.ref } });
    expect(nameOf(web) === n3, 'GET /web/users/:ref returns N3').toBe(true);
    expect(nameOf(await ownProfile(fx, p)) === n3, 'V1 own profile returns N3').toBe(true);
  });

  scenario('M2-FNAME-006', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    const [n1, n2, n3] = [fx.data.firstName(), fx.data.firstName(), fx.data.firstName()];
    for (const n of [n1, n2, n3]) expectOk(await editFirstName(fx, p, n), 'edit');
    for (const round of ['after three edits', 'after repeating N3']) {
      const now = await names(fx, p);
      expect(now.app === n3 && now.pii === n3, `${round}: app and PII show N3`).toBe(true);
      if (round === 'after three edits') expectOk(await editFirstName(fx, p, n3), 'repeat edit');
    }
  });

  scenario('M2-FNAME-007', async (fx) => {
    // Its own throwaway account: a refused edit that still changes the PII name (real defect seen 2026-10-24: 256
    // characters → HTTP 500, PII name updated) must not leave the shared onboarded account 0 inconsistent.
    const p = await fx.accounts.throwaway('M2-FNAME-007');
    for (const [label, value] of [
      ['omitted', undefined],
      ['null', null],
      ['empty', ''],
      ['whitespace', '   '],
      ['256 characters', 'Q'.repeat(256)],
      ['number', 12345],
      ['emoji only', '😀😀'],
    ] as const) {
      const before = await names(fx, p);
      const body = await devBody(fx, 'API-058', asUser(fx, p));
      if (value === undefined) deleteDeep(body, 'first_name');
      else setDeep(body, 'first_name', value);
      const res = await call(fx, 'API-058', asUser(fx, p), { body });
      if (!isSuccess(res.status)) {
        const after = await names(fx, p);
        expect(
          after.app === before.app && after.pii === before.pii,
          `${label}: refused value leaves the name unchanged`,
        ).toBe(true);
      }
    }
  });

  scenario('M2-FNAME-008', async (fx) => {
    const p = await fx.accounts.onboarded(0);
    // Shared onboarded account 0: its previous name is put back at the end (fix 2026-10-25), so a lossy or partial
    // write never leaves app name ≠ PII name for later cases.
    const previous = (await names(fx, p)).app;
    try {
      for (const value of ['  Qa  Name ', 'José', 'देवा', "D'Souza", 'Anne-Marie']) {
        const res = await editFirstName(fx, p, value);
        if (isSuccess(res.status)) {
          const now = await names(fx, p);
          expect(now.app === now.pii, 'app read and PII read are identical').toBe(true);
          // From code (M2Q-06): the normalised value; lossy results are recorded as a possible defect.
          if (/^[A-Za-z\s]+$/.test(value) || !/[A-Za-z]/.test(value))
            expect(now.app === normalizeFirstName(value), 'stored as the normalised value').toBe(true);
          else
            noteEvidence(
              `Lossy normalisation for a ${value.length}-character input (possible defect, M2Q-06).`,
            );
        }
      }
    } finally {
      await restoreFirstName(fx, p, previous);
    }
  });

  scenario('M2-FNAME-009', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const full = String(nameOf(await ownProfile(fx, a)));
    expectOk(await call(fx, 'API-032', asUser(fx, a)), 'toggle_hide_name (hide)');
    try {
      const seen = await otherUsersView(fx, b, a);
      expect(seen === full, 'B never sees A’s full name').toBe(false);
      expect(seen === maskedFirstName(full), 'B sees the first letter, capitalised (from code, M2Q-13)').toBe(
        true,
      );
      expect(nameOf(await ownProfile(fx, a)) === full, 'A still sees the full name (from code, M2Q-13)').toBe(
        true,
      );
    } finally {
      await call(fx, 'API-032', asUser(fx, a)); // restore
    }
  });

  scenario('M2-FNAME-010', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const full = nameOf(await ownProfile(fx, a));
    expectOk(await call(fx, 'API-032', asUser(fx, a)), 'hide');
    expect((await otherUsersView(fx, b, a)) === full, 'hidden: B does not see the full name').toBe(false);
    expectOk(await call(fx, 'API-032', asUser(fx, a)), 'unhide');
    expect((await otherUsersView(fx, b, a)) === full, 'after unhide B sees A’s full name').toBe(true);
    const b2 = { ...(await fx.accounts.returningLogin(b)), ref: b.ref };
    expect((await otherUsersView(fx, b2, a)) === full, 'state persists in a new session').toBe(true);
  });

  scenario('M2-FNAME-011', async (fx) => {
    // Suite-created onboarded accounts have no verified selfie, so they are ineligible to hide the name.
    const a = await fx.accounts.onboarded(0);
    const b = await fx.accounts.onboarded(1);
    const full = nameOf(await ownProfile(fx, a));
    const res = await call(fx, 'API-032', asUser(fx, a));
    expect(res.status, `toggle_hide_name: ${res.summary()} — 200 (from code, M2Q-13)`).toBe(200);
    const body = res.json() as { status?: unknown; first_name?: unknown } | undefined;
    expect(
      body?.status === true && body?.first_name === full,
      'reply {status:true, first_name:<full name>}',
    ).toBe(true);
    expect(nameOf(await ownProfile(fx, a)) === full, 'state unchanged for the owner').toBe(true);
    // Another user's view (profile_info?ref=A — /V1/users/:ref would return B's own profile).
    const seen = await otherUsersView(fx, b, a);
    const pii = await piiFirstName(fx, a.userId!);
    noteEvidence(
      `Another user's view: ${seen === undefined ? 'no first name for that ref' : `${String(seen).length} chars`}; view = owner: ${seen === full}; owner = PII: ${full === pii}.`,
    );
    expect(seen === full, 'another user still sees the full name (not masked)').toBe(true);
  });

  scenario('M2-FNAME-013', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const pii = await piiFirstName(fx, a.userId!);
    for (const [apiId, viewer] of [
      ['API-013', a],
      ['API-021', a], // own profile (users#show ignores :ref)
      ['API-086', a],
    ] as const) {
      const res = await call(fx, apiId, asUser(fx, viewer, a), { values: { REF: a.ref } });
      expect(nameOf(res) === pii, `${apiId}: name equals the PII first name`).toBe(true);
    }
    expect(
      (await otherUsersView(fx, b, a)) === pii,
      'API-011 (another user): name equals the PII first name',
    ).toBe(true);
  });

  // Gate-OFF half (M2Q-02): own reads return the local (onboarding) name; gate-ON half waits for Dev (M2Q-43).
  scenario('M2-FNAME-015', async (fx) => {
    const name = fx.data.firstName();
    const p = await fx.accounts.onboardFresh({ firstName: name, email: testEmail(fx, 'fname015') });
    expect(nameOf(await ownProfile(fx, p)) === name, 'fetch_own_info returns the onboarding name').toBe(true);
    expect(
      nameOf(await profileByRef(fx, p, p)) === name,
      'own /V1/users/:ref returns the onboarding name',
    ).toBe(true);
    const list = await call(fx, 'API-014', asUser(fx, p, p));
    noteEvidence(
      `matches_list_v2 with the gate off: HTTP ${list.status} (recorded; list contents not compared).`,
    );
  });

  scenario('M2-FNAME-016', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const aName = nameOf(await ownProfile(fx, a));
    for (const apiId of LISTS) {
      const res = await call(fx, apiId, asUser(fx, b, a));
      for (const item of itemsWithRef(res.json()).filter((i) => String(i.ref) === a.ref))
        expect(item.first_name === aName, `${apiId}: A’s card shows A’s own name`).toBe(true);
    }
  });

  scenario('M2-FNAME-017', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    for (const apiId of ['API-014', 'API-048', 'API-063', 'API-005']) await call(fx, apiId, asUser(fx, b, a));
    const n2 = fx.data.firstName();
    expectOk(await editFirstName(fx, a, n2), 'A edits name');
    // The poll stays well inside the test's time (40 s poll + 60 s extra), so "not seen" is recorded as evidence
    // instead of ending in a timeout.
    test.info().setTimeout(test.info().timeout + 60_000);
    const start = Date.now();
    let seen = false;
    while (!seen && Date.now() - start < FNAME_017_POLL_MS) {
      const res = await call(fx, 'API-063', asUser(fx, b, a));
      seen = itemsWithRef(res.json()).some((i) => String(i.ref) === a.ref && i.first_name === n2);
      if (!seen) await new Promise((r) => setTimeout(r, 5_000));
    }
    noteEvidence(
      `N2 ${seen ? `seen after ${Math.round((Date.now() - start) / 1000)} s` : `not seen within ${FNAME_017_POLL_MS / 1000} s`} (window: M2Q-12).`,
    );
    if (!seen)
      noteEvidence(
        'Note for Dev (M2Q-12, from code — confirm with Dev): list_connected_profiles builds each conversation from the Redis cache "conversation_<id>" (one-month expiry), which stores the counterpart’s first_name (chat/conversation.rb:800, 813, 845, develop_new 944f76a); a name edit does not seem to refresh that cache, so the old name can stay visible.',
      );
  });

  scenario('M2-FNAME-018', async () => {
    blockPrereq(
      PREREQ.states.id,
      `${PREREQ.states.reason} — approved / curated profiles that appear in discovery`,
    );
  });

  scenario('M2-FNAME-019', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    const names2 = { a: nameOf(await ownProfile(fx, a)), b: nameOf(await ownProfile(fx, b)) };
    expectOk(await call(fx, 'API-187', asUser(fx, a, b), { values: { REF: b.ref } }), 'A sends a message');
    expectOk(await call(fx, 'API-188', asUser(fx, b, a), { values: { REF: a.ref } }), 'B sends on web');
    for (const [viewer, other, otherName] of [
      [a, b, names2.b],
      [b, a, names2.a],
    ] as const) {
      const list = await call(fx, 'API-063', asUser(fx, viewer, other));
      for (const item of itemsWithRef(list.json()).filter((i) => String(i.ref) === other.ref))
        expect(
          item.first_name === otherName,
          'list_connected_profiles shows the counterpart’s own name',
        ).toBe(true);
      await call(fx, 'API-068', asUser(fx, viewer, other));
    }
    noteEvidence(
      'chat_messages uses the conversation_id of the pair (filled from the suite’s own connected accounts).',
    );
    await call(fx, 'API-069', asUser(fx, a, b));
  });

  scenario('M2-FNAME-020', async () => {
    blockPrereq('M2Q-18', 'Push payloads cannot be captured on staging yet (notification capture method)');
  });

  scenario('M2-FNAME-021', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    for (const apiId of ['API-107', 'API-108', 'API-109', 'API-110', 'API-111', 'API-112', 'API-101'])
      await call(fx, apiId, asUser(fx, a, b));
    noteEvidence('Room / event names recorded; expected values per M2Q-25.');
  });

  scenario('M2-FNAME-022', async () => {
    requireOwnOnboardedAccount();
  });

  scenario('M2-FNAME-023', async () => {
    requireOwnOnboardedAccount();
  });

  scenario('M2-FNAME-024', async (fx) => {
    if (!fx.m2Config.windows.piiOutage) blockPrereq(PREREQ.outage.id, PREREQ.outage.reason);
    const p = await fx.accounts.onboarded(0);
    const n2 = fx.data.firstName();
    const res = await editFirstName(fx, p, n2);
    noteEvidence(
      `Edit during forced PII failure: HTTP ${res.status}; app vs PII recorded (doc-predicted divergence).`,
    );
    await names(fx, p);
  });

  scenario('M2-FNAME-025', async (fx) => {
    if (!fx.m2Config.windows.piiOutage) blockPrereq(PREREQ.outage.id, PREREQ.outage.reason);
    const [a, b] = await fx.accounts.connectedPair();
    for (const apiId of ['API-013', 'API-021', 'API-014', 'API-048']) {
      const start = Date.now();
      const res = await call(fx, apiId, asUser(fx, b, a), { values: { REF: a.ref } });
      noteEvidence(`${apiId}: HTTP ${res.status} in ${Date.now() - start} ms during the outage (M2Q-11).`);
    }
  });
});
