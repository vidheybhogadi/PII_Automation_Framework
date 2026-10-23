/**
 * Scenario cases — regression (M2-REG-*): list latency with name hydration.
 */
import { scenario } from '../../src/checks/define';
import { blockPrereq, PREREQ } from '../../src/prereq';
import { noteEvidence, test } from '../../src/fixtures/m2-fixtures';
import { asUser, call } from '../../src/scenarios/helpers';

const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;

test.describe('M2 scenarios — regression', () => {
  scenario('M2-REG-005', async (fx) => {
    if (!fx.m2Config.windows.gate) blockPrereq(PREREQ.gateWindow.id, PREREQ.gateWindow.reason);
    const [a, b] = await fx.accounts.connectedPair();
    for (const apiId of ['API-014', 'API-015', 'API-048', 'API-005', 'API-020']) {
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await call(fx, apiId, asUser(fx, b, a));
        times.push(Date.now() - start);
      }
      noteEvidence(
        `${apiId} gate ${fx.m2Config.windows.gate}: p50 ${pct(times, 50)} ms, p95 ${pct(times, 95)} ms (targets: M2Q-23).`,
      );
    }
  });
});
