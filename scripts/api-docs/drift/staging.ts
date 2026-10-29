/**
 * What staging actually did, from the recorded exchanges of an M2 run (reports/m2/latest/run-data.json, written by the
 * reporting layer from the api-exchanges.json attachments of core/utils/exchange-recorder.ts). Only field NAMES are
 * collected — never values — and only from 2xx answers. Bodies in the recordings are already redacted.
 */
import { readFileSync } from 'node:fs';

export interface StagingSeen {
  /** Request field names sent (query + JSON / form body; nested object keys as dotted paths). */
  request: Map<string, number>;
  /** Top-level keys of the JSON object answers. */
  response: Map<string, number>;
  /** Calls with a 2xx answer. */
  calls: number;
  /** Calls with a JSON object answer (response keys only count when there is at least one). */
  objectAnswers: number;
  /** Test ids that made the calls (evidence; never published in the docs). */
  tests: Set<string>;
}

export interface StagingRun {
  runId: string;
  /** Run start date YYYY-MM-DD. */
  date: string;
  file: string;
  byEndpoint: Map<string, StagingSeen>;
}

interface RecordedCall {
  endpoint?: string;
  status?: number | null;
  exchange?: { url?: string; requestBody?: string | null; responseBody?: string | null };
}
interface RunData {
  run?: { runId?: string; startedAt?: string; projects?: string[] };
  tests?: { id?: string; apiCalls?: RecordedCall[] }[];
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** Dotted key paths of a parsed JSON request body (objects only; arrays of objects contribute their keys once). */
export function keyPaths(v: unknown, prefix = '', out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 4 || v === null || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    for (const x of v.slice(0, 5)) keyPaths(x, prefix, out, depth + 1);
    return out;
  }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    out.add(p);
    keyPaths(x, p, out, depth + 1);
  }
  return out;
}

/** An answer whose top-level keys are ids (user ids, 8-hex profile refs) is a map, not a fixed shape. */
export const idKeyed = (keys: string[]) =>
  keys.length > 0 && keys.every((k) => /^\d+$/.test(k) || /^[0-9A-F]{8}$/.test(k));

export function readRun(file: string): StagingRun {
  const d = JSON.parse(readFileSync(file, 'utf8')) as RunData;
  return fromRunData(d, file);
}

export function fromRunData(d: RunData, file = '(fixture)'): StagingRun {
  const byEndpoint = new Map<string, StagingSeen>();
  for (const t of d.tests ?? [])
    for (const c of t.apiCalls ?? []) {
      if (!c.endpoint || !/^API-\d+$/.test(c.endpoint)) continue;
      if (typeof c.status !== 'number' || c.status < 200 || c.status > 299) continue;
      const s = byEndpoint.get(c.endpoint) ?? {
        request: new Map(),
        response: new Map(),
        calls: 0,
        objectAnswers: 0,
        tests: new Set<string>(),
      };
      byEndpoint.set(c.endpoint, s);
      s.calls++;
      if (t.id) s.tests.add(t.id);
      const ex = c.exchange ?? {};
      const req = new Set<string>();
      try {
        const u = new URL(ex.url ?? '', 'https://x.invalid');
        for (const k of u.searchParams.keys()) req.add(k.replace(/\[\]$/, ''));
      } catch {
        /* not a URL */
      }
      if (ex.requestBody) {
        try {
          keyPaths(JSON.parse(ex.requestBody), '', req);
        } catch {
          if (/^[\w%[\]-]+=/.test(ex.requestBody))
            for (const k of new URLSearchParams(ex.requestBody).keys()) req.add(k.replace(/\[\]$/, ''));
        }
      }
      for (const k of req) bump(s.request, k);
      if (ex.responseBody) {
        try {
          const j = JSON.parse(ex.responseBody) as unknown;
          if (j && typeof j === 'object' && !Array.isArray(j)) {
            const keys = Object.keys(j);
            if (!idKeyed(keys)) {
              s.objectAnswers++;
              for (const k of keys) bump(s.response, k);
            }
          }
        } catch {
          /* not JSON (HTML pages, truncated bodies) */
        }
      }
    }
  return {
    runId: d.run?.runId ?? 'unknown run',
    date: (d.run?.startedAt ?? '').slice(0, 10),
    file,
    byEndpoint,
  };
}
