/**
 * Catalogue ids for Dev cURL placeholders (FAITH_ID, TRAIT_ID, …). Order (user decision 2026-10-24):
 *   1. M2_VALUE_<NAME> from the environment;
 *   2. the config default (DEFAULT_VALUES, m2-config.ts), CHECKED against the live option list where one exists:
 *      kept when the live list contains it; for the /V1/fields lists, otherwise the first live id is used;
 *   3. the config default unchanged when the list cannot be read (or for /V1/introduction, whose list mixes text and
 *      audio questions, so a different id is never picked from it).
 * Each value's source is recorded on the test ("assumption" annotation). Results are cached per worker.
 */
import { test } from '@playwright/test';
import type { ExtraRoute, M2Client, AuthMode, Device } from '../clients/m2-client';
import type { M2Config } from '../config/m2-config';

const route = (key: string, path: string): ExtraRoute => ({
  key,
  method: 'GET',
  path,
  headers: ['Accept', 'device_type', 'app_version', 'unique_identifier'],
});

/** Live option lists (config/routes.rb:39-50, 347 on develop_new 944f76a — from code). */
const LIVE: Record<string, { route: ExtraRoute; keys: string[]; pickFirst: boolean }> = {
  INTEREST_ID: {
    route: route('fieldsInterests', '/V1/fields/interests'),
    keys: ['id', 'interest_id'],
    pickFirst: true,
  },
  INTEREST_V2_ID: {
    route: route('fieldsInterestsV2', '/V1/fields/interests_v2'),
    keys: ['id', 'interest_id'],
    pickFirst: true,
  },
  TRAIT_ID: { route: route('fieldsTraits', '/V1/fields/traits'), keys: ['id', 'trait_id'], pickFirst: true },
  SETTLE_ID: {
    route: route('fieldsSettleDown', '/V1/fields/settle_down_option_list'),
    keys: ['id'],
    pickFirst: true,
  },
  MBTI_ID: { route: route('fieldsMbti', '/V1/fields/mbti_option_list'), keys: ['id'], pickFirst: true },
  PHONE_CODE_ID: {
    route: route('fieldsPhonecodes', '/V1/fields/phonecodes'),
    keys: ['id'],
    pickFirst: false,
  },
  QUESTION_ID: {
    route: route('introduction', '/V1/introduction'),
    keys: ['id', 'question_id'],
    pickFirst: false,
  },
  AUDIO_QUESTION_ID: {
    route: route('introduction', '/V1/introduction'),
    keys: ['id', 'question_id'],
    pickFirst: false,
  },
};

const cache = new Map<string, Promise<{ value: string; source: string }>>();

/** Ids under `keys` anywhere in a body, in document order; `first` = first id of the first list of objects. */
export function idsIn(body: unknown, keys: string[]): { all: Set<string>; first: string | undefined } {
  const all = new Set<string>();
  let first: string | undefined;
  const walk = (v: unknown, inList: boolean) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, true));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (keys.includes(k) && (typeof x === 'number' || (typeof x === 'string' && /^\d+$/.test(x)))) {
          all.add(String(x));
          if (inList && first === undefined) first = String(x);
        }
        walk(x, inList);
      }
  };
  walk(body, false);
  return { all, first };
}

/** The catalogue value for `name`, or undefined when there is neither an environment value nor a default. */
export async function catalogueValue(
  name: string,
  config: M2Config,
  client: M2Client,
  caller: { auth: AuthMode; device?: Device | undefined },
): Promise<string | undefined> {
  if (config.values[name] !== undefined) return config.values[name];
  const fallback = config.defaultValues[name];
  if (fallback === undefined) return undefined;
  const live = LIVE[name];
  if (!live) return fallback;
  let found = cache.get(name);
  if (!found) {
    found = (async () => {
      try {
        const res = await client.callRoute(live.route, {
          auth: caller.auth,
          ...(caller.device ? { device: caller.device } : {}),
        });
        if (res.status !== 200 || !res.isJson)
          return { value: fallback, source: `default (live list HTTP ${res.status})` };
        const { all, first } = idsIn(res.json(), live.keys);
        if (all.has(fallback)) return { value: fallback, source: 'default, present in the live list' };
        if (live.pickFirst && first !== undefined)
          return { value: first, source: 'first id of the live list (default not listed)' };
        return { value: fallback, source: 'default (not found in the live list)' };
      } catch {
        return { value: fallback, source: 'default (live list not reachable)' };
      }
    })();
    cache.set(name, found);
  }
  const { value, source } = await found;
  test.info().annotations.push({
    type: 'assumption',
    description: `${name}: ${source} — from code / staging, confirm with Dev (M2Q-36).`,
  });
  return value;
}
