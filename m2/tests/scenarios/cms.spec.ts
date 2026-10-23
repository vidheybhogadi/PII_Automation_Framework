/**
 * Scenario cases — CMS / admin (M2-CMS-*). Admin calls need a CMS test admin (admin JWT + webcms OTP, M2Q-04) and
 * act only on the suite's own synthetic profiles. The ActiveAdmin IRL page (M2-CMS-008) stays manual.
 */
import { scenario } from '../../src/checks/define';
import { expect, test } from '../../src/fixtures/m2-fixtures';
import { call, defaultCaller, nameOf, piiFirstName } from '../../src/scenarios/helpers';

test.describe('M2 scenarios — CMS / admin', () => {
  scenario('M2-CMS-001', async (fx) => {
    const admin = await defaultCaller(fx, 'API-136');
    const p = await fx.accounts.onboarded(0);
    const pii = await piiFirstName(fx, p.userId!);
    for (const apiId of ['API-136', 'API-138', 'API-163', 'API-164', 'API-165', 'API-177'])
      expect(
        nameOf(await call(fx, apiId, admin, { values: { REF: p.ref } })) === pii,
        `${apiId}: admin view shows the PII name`,
      ).toBe(true);
  });

  scenario('M2-CMS-002', async (fx) => {
    const admin = await defaultCaller(fx, 'API-139');
    const p = await fx.accounts.onboarded(0);
    for (const apiId of ['API-139', 'API-140']) {
      await call(fx, apiId, admin, { values: { REF: p.ref }, synthetic: { firstName: '  QaAdmin  ' } });
      expect((await piiFirstName(fx, p.userId!)) === 'QaAdmin', `${apiId}: trimmed name saved to PII`).toBe(
        true,
      );
    }
  });

  scenario('M2-CMS-003', async (fx) => {
    const admin = await defaultCaller(fx, 'API-149');
    for (const apiId of ['API-149', 'API-151', 'API-153', 'API-154', 'API-180', 'API-209'])
      await call(fx, apiId, admin);
  });

  scenario('M2-CMS-004', async (fx) => {
    const admin = await defaultCaller(fx, 'API-160');
    await call(fx, 'API-160', admin);
    await call(fx, 'API-178', admin);
  });

  scenario('M2-CMS-006', async (fx) => {
    const admin = await defaultCaller(fx, 'API-179');
    await call(fx, 'API-179', admin);
    await call(fx, 'API-184', admin);
  });
});
