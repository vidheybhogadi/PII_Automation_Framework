/**
 * Scenario cases — end-to-end and integration (M2-INT-*).
 */
import { scenario } from '../../src/checks/define';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { expect, noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import {
  asTestToken,
  asUser,
  call,
  expectOk,
  nameOf,
  ownProfile,
  piiFirstName,
  submitProfile,
  testEmail,
} from '../../src/scenarios/helpers';

/** The value of `field` in a facade read reply (items [{field, value}], possibly under a data envelope). */
function facadeValue(body: unknown, field: string): unknown {
  if (Array.isArray(body)) {
    for (const b of body) {
      const v = facadeValue(b, field);
      if (v !== undefined) return v;
    }
  } else if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (o.field === field && 'value' in o) return o.value;
    for (const v of Object.values(o)) {
      const found = facadeValue(v, field);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

const TWINS: [string, string][] = [
  ['API-116', 'API-005'],
  ['API-120', 'API-021'],
  ['API-125', 'API-046'],
  ['API-126', 'API-048'],
];

test.describe('M2 scenarios — integration', () => {
  scenario('M2-INT-001', async (fx) => {
    const a = await fx.accounts.freshUser();
    const b = await fx.accounts.freshUser();
    for (const p of [a, b])
      expectOk(
        await submitProfile(fx, p, { firstName: fx.data.firstName(), email: testEmail(fx, 'int001') }),
        'onboarding',
      );
    noteEvidence(
      'The remaining lifecycle steps (edit, hide, like / accept, chat, delete) follow once onboarding works (M2Q-36).',
    );
  });

  scenario('M2-INT-002', async (fx) => fx.accounts.admin());

  scenario('M2-INT-003', async (fx) => {
    // From code — confirm with Dev (M2Q-12): API-001 reads Pii::FieldStore.get_first_name, which answers from the
    // Redis FieldCache first (app/services/pii/field_store.rb:63-71; 30-day TTL, config.rb:5,50); the facade write
    // (API-199) does not touch that cache. The facade read (API-200) goes to the PII service without the cache.
    const p = await fx.accounts.onboarded(0);
    const n1 = nameOf(await ownProfile(fx, p));
    expect(typeof n1 === 'string' && n1.length > 0, 'own profile has a first name (N1)').toBe(true);
    // Warm the cache: the PII route now returns (and caches) N1.
    expect((await piiFirstName(fx, p.userId!)) === n1, 'PII route returns N1 before the write').toBe(true);
    const n2 = fx.data.firstName();
    try {
      const w = await call(fx, 'API-199', asTestToken(fx), {
        body: { user_id: p.userId, field: 'NAME', value: n2 },
        retry: false,
      });
      expectOk(w, 'facade write');
      expect(
        (await piiFirstName(fx, p.userId!)) === n1,
        'PII route still returns the cached N1 (facade writes do not refresh the cache — from code)',
      ).toBe(true);
      const r = await call(fx, 'API-200', asTestToken(fx), {
        body: { user_id: p.userId, field_names: ['NAME'] },
        retry: false,
      });
      expectOk(r, 'facade read');
      expect(facadeValue(r.json(), 'NAME') === n2, 'facade read (PII service, no cache) returns N2').toBe(
        true,
      );
      noteEvidence(
        `App own profile ${nameOf(await ownProfile(fx, p)) === n1 ? 'still shows N1' : 'shows a new value'} after the facade write (recorded, not asserted).`,
      );
    } finally {
      // Restore: write N1 through the app route (PII + local name + clear_cache!), so the pooled account is consistent.
      const back = await call(fx, 'API-002', asTestToken(fx), {
        body: { user_id: p.userId, first_name: n1 },
        retry: false,
      });
      fx.observe('API-002 restore N1', back);
    }
  });

  scenario('M2-INT-004', async () => blockPrereq(PREREQ.outage.id, PREREQ.outage.reason));

  scenario('M2-INT-005', async (fx) => {
    const [a, b] = await fx.accounts.connectedPair();
    for (const [web, app] of TWINS) {
      const w = await call(fx, web, asUser(fx, b, a), { values: { REF: a.ref } });
      const v = await call(fx, app, asUser(fx, b, a), { values: { REF: a.ref } });
      expect(nameOf(w) === nameOf(v), `${web} vs ${app}: same first name`).toBe(true);
    }
  });
});
