/**
 * Compares what the docs state about each endpoint with the Aisle code (at HEAD = origin/develop_new, and at the
 * documented snapshot BASE = ae838f4) and with what staging returned in the latest M2 run. Pure: no I/O.
 *
 * Rules (facts only — anything ambiguous goes to "needs review" and is never applied):
 *   endpoint removed   no route at HEAD, a route at BASE (high). Staging still answering on or after the HEAD commit
 *                      date → needs review (staging wins).
 *   endpoint restored  documented as removed, route back at HEAD.
 *   endpoint added     a route at HEAD, not at BASE, served by a controller the docs already cover (list only).
 *   param added        HEAD action reads a literal param the docs do not list (high when new since BASE, medium when
 *                      BASE read it too — a gap in the source document). Sent-on-staging-only → needs review.
 *   param removed      HEAD reads its params completely statically, BASE read the param, HEAD does not (high).
 *   param changed      required / type differs between BASE and HEAD (or the documented value) for a documented param.
 *   field added        a top-level response key seen in a 2xx on staging (high), or rendered by a literal hash at HEAD
 *                      (high when the render is wholly literal, medium when only some keys are visible).
 *   field removed      a documented field no longer in a wholly literal HEAD render that BASE rendered (high), unless
 *                      staging still returned it (needs review). Not seen on staging alone → needs review.
 */
import type { Attrs, ChangeKind, ChangeSource, DocItem } from '../changes';
import type { CodeSnapshot } from './code';
import type { StagingRun } from './staging';

export interface DocEndpoint {
  apiId: string;
  method: string;
  path: string;
  /** The controller file the docs name ("Source:" line), if any. */
  sourceFile?: string;
  params: DocItem[];
  responseFields: DocItem[];
  headers: string[];
  removed?: { on: string };
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Finding {
  apiId: string;
  method: string;
  path: string;
  /** endpoint-added and route-changed are listed only (never applied). */
  kind: ChangeKind | 'endpoint-added' | 'route-changed';
  name: string;
  before: Attrs | null;
  after: Attrs | null;
  source: ChangeSource;
  confidence: Confidence;
  /** Evidence lines: file:line @sha, staging run + date (+ test ids). */
  evidence: string[];
  note?: string;
  /** Needs review: never applied. */
  review?: boolean;
}

export interface NotDetermined {
  apiId: string;
  method: string;
  path: string;
  what: 'route' | 'params' | 'response';
  reasons: string[];
}

export interface DriftResult {
  head: { ref: string; sha: string; date: string };
  base: { ref: string; sha: string; date: string };
  staging: { runId: string; date: string; file: string }[];
  checked: number;
  findings: Finding[];
  notDetermined: NotDetermined[];
  routeFileDynamic: { line: number; text: string }[];
}

const short = (sha: string) => sha.slice(0, 7);
const norm = (k: string) => k.replace(/\[\]$/, '').toLowerCase().replace(/-/g, '_');
const leaf = (k: string) => k.split('.').pop()!;

/** Is a code / staging field name already covered by the documented names (Dev cURL keys are flattened)? */
export function covered(name: string, documented: Set<string>): boolean {
  const n = norm(name);
  if (documented.has(n)) return true;
  if (documented.has(norm(leaf(name)))) return true;
  return false;
}

export function compare(
  docs: DocEndpoint[],
  head: CodeSnapshot,
  base: CodeSnapshot,
  runs: StagingRun[],
): DriftResult {
  const findings: Finding[] = [];
  const notDetermined: NotDetermined[] = [];
  const latest = [...runs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const stagingOf = (apiId: string) => {
    for (const r of [...runs].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      const s = r.byEndpoint.get(apiId);
      if (s) return { run: r, seen: s };
    }
    return undefined;
  };
  const stagingEvidence = (r: StagingRun, tests: Set<string>) =>
    `staging run ${r.runId} (${r.date}), tests ${[...tests].slice(0, 3).join(', ')}${tests.size > 3 ? ` +${tests.size - 3}` : ''}`;

  for (const d of docs) {
    const at = (f: Omit<Finding, 'apiId' | 'method' | 'path'>) =>
      findings.push({ apiId: d.apiId, method: d.method, path: d.path, ...f });
    const h = head.endpoint(d.method, d.path);
    const b = base.endpoint(d.method, d.path);
    const st = stagingOf(d.apiId);

    // ---- Endpoint exists? ------------------------------------------------------------------------------------
    if (!h.route) {
      if (d.removed) continue;
      if (b.route) {
        const live = st && st.run.date >= head.date;
        at({
          kind: 'endpoint-removed',
          name: '',
          before: null,
          after: null,
          source: 'code',
          confidence: live ? 'low' : 'high',
          evidence: [
            `config/routes.rb @${short(head.sha)}: no route for ${d.method} ${d.path}`,
            `config/routes.rb:${b.route.line} @${short(base.sha)} routed it to ${b.route.controller}#${b.route.action}`,
            ...(st ? [`${stagingEvidence(st.run, st.seen.tests)} still answered 2xx`] : []),
          ],
          ...(live
            ? {
                review: true,
                note: 'Staging still answered on or after the code commit date — staging wins until it stops.',
              }
            : st
              ? { note: `Last answered on staging ${st.run.date}, before the commit that removed the route.` }
              : {}),
        });
      } else
        notDetermined.push({
          apiId: d.apiId,
          method: d.method,
          path: d.path,
          what: 'route',
          reasons: [
            `no static route at ${short(base.sha)} or ${short(head.sha)} (generated by a gem such as ActiveAdmin, or the documented path differs)`,
          ],
        });
      continue;
    }
    if (d.removed) {
      at({
        kind: 'endpoint-restored',
        name: '',
        before: null,
        after: null,
        source: 'code',
        confidence: 'high',
        evidence: [
          `config/routes.rb:${h.route.line} @${short(head.sha)} routes it to ${h.route.controller}#${h.route.action}`,
        ],
      });
    }
    const headFile = `app/controllers/${h.route.controller}_controller.rb`;
    if (d.sourceFile && /_controller\.rb$/.test(d.sourceFile) && d.sourceFile !== headFile)
      at({
        kind: 'route-changed',
        name: `${h.route.controller}#${h.route.action}`,
        before: null,
        after: null,
        source: 'code',
        confidence: 'low',
        evidence: [
          `config/routes.rb:${h.route.line} @${short(head.sha)} → ${h.route.controller}#${h.route.action}`,
        ],
        note: `The docs name ${d.sourceFile}; the route now points at ${headFile}.`,
        review: true,
      });

    // ---- Request params ----------------------------------------------------------------------------------------
    const documented = new Set(
      [
        ...d.params.filter((p) => !p.removedOn).map((p) => p.name),
        ...d.headers,
        ...h.pathParams,
        ...b.pathParams,
      ].map(norm),
    );
    const docParam = (name: string) => d.params.find((p) => !p.removedOn && norm(p.name) === norm(name));
    const hf = h.facts;
    const bf = b.facts;
    if (!hf) {
      notDetermined.push({
        apiId: d.apiId,
        method: d.method,
        path: d.path,
        what: 'params',
        reasons: [h.problem ?? '?'],
      });
    } else {
      const reasons = hf.review.filter((r) => /params/.test(r));
      if (!hf.paramsComplete)
        notDetermined.push({ apiId: d.apiId, method: d.method, path: d.path, what: 'params', reasons });
      for (const p of hf.params) {
        if (covered(p.name, documented)) continue;
        const atBase = bf?.params.find((x) => x.name === p.name);
        const sent = st?.seen.request.get(p.name) ?? st?.seen.request.get(leaf(p.name));
        at({
          kind: 'param-added',
          name: p.name,
          before: null,
          after: { required: p.required, ...(p.type ? { type: p.type } : {}) },
          source: 'code',
          confidence: atBase || !bf ? 'medium' : 'high',
          evidence: [
            `${hf.file}:${p.line} @${short(head.sha)}${p.via ? ` (via ${p.via})` : ''}`,
            ...(sent && st ? [`also sent on staging (${st.run.date})`] : []),
          ],
          ...(atBase
            ? { note: `Already read at ${short(base.sha)} — missing from the source document.` }
            : {}),
        });
      }
      // Removed: documented param that HEAD no longer reads, BASE did, and HEAD's reading is fully static.
      for (const dp of d.params.filter((p) => !p.removedOn)) {
        const inHead = hf.params.some(
          (p) => norm(p.name) === norm(dp.name) || norm(leaf(p.name)) === norm(dp.name),
        );
        if (inHead || h.pathParams.map(norm).includes(norm(dp.name))) continue;
        const inBase = bf?.params.find(
          (p) => norm(p.name) === norm(dp.name) || norm(leaf(p.name)) === norm(dp.name),
        );
        if (!inBase) continue; // never read statically at either ref (filter / model reads it) — not a change
        if (!hf.paramsComplete) {
          at({
            kind: 'param-removed',
            name: dp.name,
            before: null,
            after: null,
            source: 'code',
            confidence: 'low',
            evidence: [
              `${bf!.file}:${inBase.line} @${short(base.sha)} read it; ${hf.file} @${short(head.sha)} does not`,
            ],
            note: 'The action now hands its params on whole, so the param may still be read elsewhere.',
            review: true,
          });
          continue;
        }
        at({
          kind: 'param-removed',
          name: dp.name,
          before: null,
          after: null,
          source: 'code',
          confidence: 'high',
          evidence: [
            `${bf!.file}:${inBase.line} @${short(base.sha)} read it`,
            `${hf.file}:${hf.line}-… @${short(head.sha)} no longer reads it`,
          ],
        });
      }
      // Changed: required / type of a documented param.
      for (const p of hf.params) {
        const dp = docParam(p.name);
        if (!dp) continue;
        const prev: Attrs =
          dp.required !== undefined || dp.type !== undefined
            ? {
                ...(dp.required !== undefined ? { required: dp.required } : {}),
                ...(dp.type ? { type: dp.type } : {}),
              }
            : (() => {
                const x = bf?.params.find((q) => q.name === p.name);
                return x ? { required: x.required, ...(x.type ? { type: x.type } : {}) } : {};
              })();
        const diff: Attrs = {};
        if (prev.required !== undefined && prev.required !== p.required) diff.required = p.required;
        if (prev.type && p.type && prev.type !== p.type) diff.type = p.type;
        if (Object.keys(diff).length)
          at({
            kind: 'param-changed',
            name: dp.name,
            before: prev,
            after: { required: p.required, ...(p.type ? { type: p.type } : {}) },
            source: 'code',
            confidence: 'high',
            evidence: [`${hf.file}:${p.line} @${short(head.sha)}`],
          });
      }
    }
    // Staging-only request fields → needs review.
    if (st)
      for (const [name] of st.seen.request) {
        if (name.includes('.')) continue; // nested keys are covered by their parent
        if (covered(name, documented)) continue;
        if (hf?.params.some((p) => norm(p.name) === norm(name) || norm(leaf(p.name)) === norm(name)))
          continue;
        at({
          kind: 'param-added',
          name,
          before: null,
          after: null,
          source: 'staging',
          confidence: 'low',
          evidence: [stagingEvidence(st.run, st.seen.tests)],
          note: 'Sent by the QA suite and answered 2xx, but the code does not show it being read.',
          review: true,
        });
      }

    // ---- Response fields ------------------------------------------------------------------------------------------
    const docFields = new Set(d.responseFields.filter((f) => !f.removedOn).map((f) => norm(f.name)));
    const seenStaging = st && st.seen.objectAnswers ? st.seen.response : new Map<string, number>();
    if (hf && !hf.responseComplete && !seenStaging.size)
      notDetermined.push({
        apiId: d.apiId,
        method: d.method,
        path: d.path,
        what: 'response',
        reasons: hf.review.filter((r) => /render|view|JSON|keys/.test(r)),
      });
    const added = new Set<string>();
    for (const [name] of seenStaging) {
      if (docFields.has(norm(name))) continue;
      added.add(norm(name));
      const inCode = hf?.responseKeys.find((k) => k.name === name);
      at({
        kind: 'field-added',
        name,
        before: null,
        after: null,
        source: 'staging',
        confidence: 'high',
        evidence: [
          stagingEvidence(st!.run, st!.seen.tests),
          ...(inCode && hf ? [`${hf.file}:${inCode.line} @${short(head.sha)}`] : []),
        ],
      });
    }
    if (hf)
      for (const k of hf.responseKeys) {
        if (docFields.has(norm(k.name)) || added.has(norm(k.name))) continue;
        added.add(norm(k.name));
        at({
          kind: 'field-added',
          name: k.name,
          before: null,
          after: null,
          source: 'code',
          confidence: hf.responseComplete ? 'high' : 'medium',
          evidence: [`${hf.file}:${k.line} @${short(head.sha)}`],
          ...(seenStaging.size
            ? { note: 'Rendered by the code; not in the staging answers recorded (conditional).' }
            : {}),
        });
      }
    for (const f of d.responseFields.filter((x) => !x.removedOn)) {
      const inHead = hf?.responseKeys.some((k) => norm(k.name) === norm(f.name));
      const inBase = bf?.responseKeys.find((k) => norm(k.name) === norm(f.name));
      const onStaging = seenStaging.has(f.name);
      if (hf && hf.responseComplete && !inHead && inBase) {
        at({
          kind: 'field-removed',
          name: f.name,
          before: null,
          after: null,
          source: 'code',
          confidence: onStaging ? 'low' : 'high',
          evidence: [
            `${bf!.file}:${inBase.line} @${short(base.sha)} rendered it`,
            `${hf.file}:${hf.line} @${short(head.sha)} renders a literal hash without it`,
            ...(onStaging && st ? [`${stagingEvidence(st.run, st.seen.tests)} still returned it`] : []),
          ],
          ...(onStaging
            ? { review: true, note: 'Staging still returns it — staging wins until it stops.' }
            : {}),
        });
      } else if (
        f.source === 'staging' &&
        latest &&
        st?.run === latest &&
        st.seen.objectAnswers &&
        !onStaging &&
        !inHead
      )
        at({
          kind: 'field-removed',
          name: f.name,
          before: null,
          after: null,
          source: 'staging',
          confidence: 'low',
          evidence: [
            `${stagingEvidence(st.run, st.seen.tests)}: not in ${st.seen.objectAnswers} 2xx answers`,
          ],
          note: 'Not returned in the latest run; it may be conditional.',
          review: true,
        });
    }
  }

  // ---- Endpoints added under a documented controller (new since BASE) ---------------------------------------------
  const docControllers = new Set(
    docs.map((d) => head.endpoint(d.method, d.path).route?.controller).filter((c): c is string => !!c),
  );
  const docKeys = new Set(docs.map((d) => `${d.method} ${d.path}`));
  const baseKeys = new Set(base.table.routes.map((r) => `${r.verb} ${r.path}`));
  const seen = new Set<string>();
  for (const r of head.table.routes) {
    const key = `${r.verb} ${r.path}`;
    if (r.glob || seen.has(key) || docKeys.has(key) || baseKeys.has(key) || !docControllers.has(r.controller))
      continue;
    // A documented path with a concrete value (…/NAME/search) is covered by its pattern.
    if (docs.some((d) => d.method === r.verb && head.endpoint(d.method, d.path).route === r)) continue;
    seen.add(key);
    findings.push({
      apiId: '',
      method: r.verb,
      path: r.path,
      kind: 'endpoint-added',
      name: `${r.controller}#${r.action}`,
      before: null,
      after: null,
      source: 'code',
      confidence: 'high',
      evidence: [`config/routes.rb:${r.line} @${short(head.sha)} (not routed at ${short(base.sha)})`],
      note: 'New API: document it through the new-API flow (it is never added by the drift check).',
    });
  }
  return {
    head: { ref: head.ref, sha: head.sha, date: head.date },
    base: { ref: base.ref, sha: base.sha, date: base.date },
    staging: runs.map((r) => ({ runId: r.runId, date: r.date, file: r.file })),
    checked: docs.length,
    findings,
    notDetermined,
    routeFileDynamic: head.table.dynamic,
  };
}
