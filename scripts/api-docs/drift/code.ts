/**
 * Reads the Aisle app source at a git ref — read-only (`git show <ref>:<path>`; never checks out, modifies or runs it)
 * — and resolves each documented endpoint to its route, controller action, request params and response keys.
 */
import { execFileSync } from 'node:child_process';
import {
  controllerFile,
  paramHelpers,
  parentController,
  parseRoutes,
  readAction,
  resolveRoute,
  rubyMethods,
  serverSetParams,
  type ActionFacts,
  type Route,
  type RouteTable,
  type RubyMethod,
} from './ruby';

/** Source of files at one ref (a git repo in production, an in-memory map in the unit tests). */
export interface SourceReader {
  ref: string;
  /** Full commit SHA (or a fixture id). */
  sha: string;
  /** Commit date YYYY-MM-DD. */
  date: string;
  read(path: string): string | null;
}

export function gitReader(
  repo: string,
  ref: string,
  prefixes = ['config/routes.rb', 'app/controllers'],
): SourceReader {
  const git = (args: string[], input?: string) =>
    execFileSync('git', ['-C', repo, ...args], {
      maxBuffer: 512 << 20,
      stdio: ['pipe', 'pipe', 'ignore'],
      ...(input !== undefined ? { input: Buffer.from(input, 'utf8') } : {}),
    }) as Buffer;
  const sha = git(['rev-parse', '--verify', `${ref}^{commit}`])
    .toString('utf8')
    .trim();
  const date = git(['show', '-s', '--format=%cs', sha]).toString('utf8').trim();
  // Every file the check reads, in ONE `git cat-file --batch` call (kept in memory only; never written to disk).
  const files = new Map<string, string>();
  const list = git(['ls-tree', '-r', '--name-only', sha, '--', ...prefixes])
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
  if (list.length) {
    const buf = git(['cat-file', '--batch'], list.map((p) => `${sha}:${p}`).join('\n') + '\n');
    let at = 0;
    for (const p of list) {
      const nl = buf.indexOf(10, at);
      const header = buf.subarray(at, nl).toString('utf8');
      const size = Number(header.split(' ')[2]);
      at = nl + 1;
      if (!/ blob /.test(header) || !Number.isFinite(size)) continue;
      files.set(p, buf.subarray(at, at + size).toString('utf8'));
      at += size + 1;
    }
  }
  return { ref, sha, date, read: (p: string) => files.get(p) ?? null };
}

export const mapReader = (ref: string, files: Record<string, string>, date = '2026-01-01'): SourceReader => ({
  ref,
  sha: ref,
  date,
  read: (p) => files[p] ?? null,
});

export interface EndpointCode {
  route?: Route;
  /** Path params of the route (`:ref`, `:field`). */
  pathParams: string[];
  facts?: ActionFacts;
  /** Why the endpoint could not be read (no route, controller file missing, action not found …). */
  problem?: string;
}

export interface CodeSnapshot {
  ref: string;
  sha: string;
  date: string;
  table: RouteTable;
  endpoint(method: string, path: string): EndpointCode;
}

interface ControllerInfo {
  methods: RubyMethod[];
  /** Methods of this controller and its parents (own first). */
  all: RubyMethod[];
  serverSet: Set<string>;
}

export function snapshot(src: SourceReader): CodeSnapshot {
  const routesSrc = src.read('config/routes.rb');
  if (routesSrc === null) throw new Error(`config/routes.rb not found at ${src.ref}`);
  const table = parseRoutes(routesSrc);
  const ctrls = new Map<string, ControllerInfo | null>();
  const load = (controller: string, seen = new Set<string>()): ControllerInfo | null => {
    if (ctrls.has(controller)) return ctrls.get(controller)!;
    const text = src.read(controllerFile(controller));
    if (text === null) {
      ctrls.set(controller, null);
      return null;
    }
    seen.add(controller);
    const methods = rubyMethods(text);
    let parentInfo: ControllerInfo | null = null;
    const parent = parentController(text, controller);
    if (parent)
      for (const cand of parent.split('|'))
        if (!seen.has(cand) && src.read(controllerFile(cand)) !== null) {
          parentInfo = load(cand, seen);
          break;
        }
    const serverSet = new Set([...serverSetParams(text), ...(parentInfo?.serverSet ?? [])]);
    const info = { methods, all: [...methods, ...(parentInfo?.all ?? [])], serverSet };
    ctrls.set(controller, info);
    return info;
  };
  const memo = new Map<string, EndpointCode>();
  return {
    ref: src.ref,
    sha: src.sha,
    date: src.date,
    table,
    endpoint(method: string, path: string): EndpointCode {
      const key = `${method} ${path}`;
      if (!memo.has(key)) memo.set(key, read(method, path));
      return memo.get(key)!;
    },
  };
  function read(method: string, path: string): EndpointCode {
    {
      const route = resolveRoute(table, method, path);
      if (!route)
        return { pathParams: [], problem: 'no route in config/routes.rb matches this method and path' };
      const pathParams = route.path
        .split('/')
        .filter((s) => s.startsWith(':') || s.startsWith('*'))
        .map((s) => s.slice(1));
      const info = load(route.controller);
      if (!info)
        return {
          route,
          pathParams,
          problem: `controller file ${controllerFile(route.controller)} not found`,
        };
      const action = info.methods.find((m) => m.name === route.action);
      if (!action)
        return {
          route,
          pathParams,
          problem: `action ${route.action} is not defined in ${controllerFile(route.controller)} (inherited or generated)`,
        };
      const facts = readAction(action, controllerFile(route.controller), {
        helpers: paramHelpers(info.all),
        readers: new Map(
          info.all
            // Own private helpers and the parent controllers' methods (filters, helpers) — never another action.
            .filter(
              (m) =>
                !m.args &&
                m.name !== action.name &&
                (m.private || !info.methods.includes(m)) &&
                m.lines.slice(1).some((l) => /\bparams\s*[[.]/.test(l.code)),
            )
            .map((m) => [m.name, m]),
        ),
        serverSet: info.serverSet,
        methods: info.all,
      });
      // `def a; return b; end` — an action that only calls another zero-argument method of the controller.
      const only = action.lines
        .slice(1, -1)
        .map((l) => l.skel.trim())
        .filter(Boolean);
      const target = only.length === 1 ? only[0]!.match(/^(?:return\s+)?([a-z_]\w*[?!]?)$/)?.[1] : undefined;
      const other = target ? info.all.find((m) => m.name === target && !m.args && m !== action) : undefined;
      if (other) {
        const f = readAction(other, controllerFile(route.controller), {
          helpers: paramHelpers(info.all),
          readers: new Map(),
          serverSet: info.serverSet,
          methods: info.all,
        });
        f.review.unshift(`${facts.file}:${action.start} delegates to ${other.name} (line ${other.start})`);
        return { route, pathParams, facts: { ...f, action: action.name } };
      }
      return { route, pathParams, facts };
    }
  }
}
