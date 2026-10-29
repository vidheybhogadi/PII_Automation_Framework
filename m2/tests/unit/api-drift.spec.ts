/**
 * Self-tests of the API docs drift check (scripts/api-docs/drift*, changes.ts) and of the export merge — no network,
 * no Aisle clone: small routes.rb / controller snippets, a fake M2 run and a fake change log.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  appendChanges,
  docState,
  STRIKE_DAYS,
  type ApiChange,
  type ChangeLog,
} from '../../../scripts/api-docs/changes';
import { mapReader, snapshot } from '../../../scripts/api-docs/drift/code';
import { compare, covered, type DocEndpoint } from '../../../scripts/api-docs/drift/compare';
import { lexRuby, parseRoutes, resolveRoute, rubyMethods } from '../../../scripts/api-docs/drift/ruby';
import { fromRunData, idKeyed } from '../../../scripts/api-docs/drift/staging';
import { applicable, markVerified, reportMarkdown, toChanges } from '../../../scripts/api-docs/drift';
import { build, guides, markdown } from '../../../scripts/api-docs/export';
import { masterSkill } from '../../../scripts/api-docs/master-skill';
import { areaFor, codeRoutesFrom, codeRoutesMarkdown } from '../../../scripts/api-docs/code-routes';
import { parseInventory } from '../../../m2/scripts/m2-inventory';

const ROOT = path.resolve(__dirname, '../../..');

// ---- Fixtures --------------------------------------------------------------------------------------------------
const ROUTES_BASE = `Rails.application.routes.draw do
	devise_for :admin_users, ActiveAdmin::Devise.config
	ActiveAdmin.routes(self)
	scope module: 'v1', as: 'v1', path: 'V1' do
		get "pii_integration/first_name" => "pii_integration#read_first_name"
		post "pii_integration/first_name" => "pii_integration#write_first_name"
		post "users/edit" => "users#edit_profile" # => edit "with # in a comment"
		post "users/legacy" => "users#legacy"
		get "users/:ref" => "users#show"
		scope "api/v1/pii-test" do
			post "/" => "pii_test#proxy_write"
			post ":field/search" => "pii_test#proxy_search"
		end
		resources :like, only: [:create]
	end
	namespace :web do
		post "user/edit" => "users#edit_profile"
	end
	get "fields/faiths"
end
Rails.application.routes.draw do
	get '*path', to: 'application#restricted_calls', constraints: RouteConstraint.new
end
`;
// HEAD: users/legacy removed, users/new_thing added (same controller).
const ROUTES_HEAD = ROUTES_BASE.replace(
  `		post "users/legacy" => "users#legacy"\n`,
  `		post "users/new_thing" => "users#new_thing"\n`,
);

const API_CONTROLLER = `module V1
	class ApiController < ApplicationController
		before_action :standardize_params

		def standardize_params
			params['app_version'] = request.headers['HTTP_APP_VERSION'] if request.headers['HTTP_APP_VERSION'].present?
			params['page'] = if params['page'].present? && params['page'].to_i > 0
				params['page'].to_i
			else
				1
			end
			params['ip_address'] = request.remote_ip
		end

		def required_param(name)
			value = params[name]
			raise ActionController::ParameterMissing, name if value.blank?
			value
		end

		def array_param(name)
			Array(params.require(name))
		end
	end
end
`;
const USERS_BASE = `class V1::UsersController < V1::ApiController
	before_action :authenticate_token

	def edit_profile
		user = params.require(:user).permit(:about, :height)
		age = params[:age].to_i
		about = params.dig(:data, :about)
		# params[:commented_out] is not a request field
		if params['data']['user_traits'].present?
			x = params.fetch(:mode, 'quick')
		end
		render json: { status: true, user: user, ref: 'R' }
	end

	def legacy
		render json: { ok: true }
	end

	def show
		response = current_profile.fetch_profile_info params
		response['intro_questions'] = []
		render json: response
	end

	def new_thing
		render json: { done: true }
	end

	private

	def helper_reads
		params[:secret_helper]
	end
end
`;
// HEAD: age no longer read, mode now required (fetch without default), render drops `ref`, adds `user_id`.
const USERS_HEAD = USERS_BASE.replace(`		age = params[:age].to_i\n`, '')
  .replace(`params.fetch(:mode, 'quick')`, `params.fetch(:mode)`)
  .replace(
    `{ status: true, user: user, ref: 'R' }`,
    `{ status: true, user: user, user_id: 1, newly: params['newly'] }`,
  );
const PII_INTEGRATION = `module V1
	class PiiIntegrationController < ApiController
		def read_first_name
			user_id = required_param('user_id')
			render json: { status: true, user_id: user_id.to_s, first_name: 'x' }
		rescue ActionController::ParameterMissing => error
			render json: { status: false, error: error.message }, status: :bad_request
		end

		def write_first_name
			user_id = required_param('user_id')
			first_name = required_param('first_name')
			render json: { status: true, user_id: user_id, first_name: first_name }
		end
	end
end
`;
const PII_TEST = `module V1
	class PiiTestController < ApiController
		def proxy_write
			proxy_post('/api/v1/pii')
		end

		def proxy_search
			proxy_post("/api/v1/pii/#{params[:field]}/search")
		end

		private

		def proxy_post(path)
			body = request.raw_post
			render json: forward(path, body)
		end
	end
end
`;
const files = (users: string, routes: string) => ({
  'config/routes.rb': routes,
  'app/controllers/v1/api_controller.rb': API_CONTROLLER,
  'app/controllers/v1/users_controller.rb': users,
  'app/controllers/v1/pii_integration_controller.rb': PII_INTEGRATION,
  'app/controllers/v1/pii_test_controller.rb': PII_TEST,
});
const BASE = snapshot(mapReader('base0001', files(USERS_BASE, ROUTES_BASE), '2026-10-15'));
const HEAD = snapshot(mapReader('head0002', files(USERS_HEAD, ROUTES_HEAD), '2026-10-29'));

const doc = (apiId: string, method: string, p: string, params: string[], extra: Partial<DocEndpoint> = {}) =>
  ({
    apiId,
    method,
    path: p,
    params: params.map((name) => ({ name, source: 'doc' as const })),
    responseFields: [],
    headers: ['Authorization', 'app_version'],
    ...extra,
  }) satisfies DocEndpoint;

const RUN = fromRunData({
  run: { runId: 'qa-auto-fixture', startedAt: '2026-10-25T10:00:00Z' },
  tests: [
    {
      id: 'M2-API-002-POS',
      apiCalls: [
        {
          endpoint: 'API-002',
          status: 200,
          exchange: {
            url: 'https://testa2.aisle.co/V1/pii_integration/first_name?trace=1',
            requestBody: '{"user_id":"1","first_name":"QaUser","meta":{"x":1}}',
            responseBody: '{"status":true,"user_id":"1","ref":"DF5BDEF1","first_name":"QaUser"}',
          },
        },
        // Non-2xx answers never count.
        { endpoint: 'API-002', status: 422, exchange: { responseBody: '{"status":false,"error":"x"}' } },
        // An id-keyed map is not a fixed shape.
        {
          endpoint: 'API-003',
          status: 200,
          exchange: { responseBody: '{"DF5BDEF1":{"a":1},"AB12CD34":{}}' },
        },
      ],
    },
  ],
});

// ---- Tests -----------------------------------------------------------------------------------------------------
test.describe('UNIT API docs drift (scripts/api-docs)', () => {
  test('UT-DRIFT-001 routes.rb: scopes, namespaces, resources, implicit targets; gems and globs are dynamic', () => {
    const t = parseRoutes(ROUTES_BASE);
    const r = (m: string, p: string) => resolveRoute(t, m, p);
    expect(r('GET', '/V1/pii_integration/first_name')).toMatchObject({
      controller: 'v1/pii_integration',
      action: 'read_first_name',
    });
    expect(r('POST', '/V1/api/v1/pii-test')).toMatchObject({
      controller: 'v1/pii_test',
      action: 'proxy_write',
    });
    expect(r('POST', '/V1/api/v1/pii-test/NAME/search')).toMatchObject({ action: 'proxy_search' });
    expect(r('POST', '/V1/like')).toMatchObject({ controller: 'v1/like', action: 'create' });
    expect(r('GET', '/V1/like'), 'only: [:create]').toBeUndefined();
    expect(r('POST', '/web/user/edit')).toMatchObject({ controller: 'web/users', action: 'edit_profile' });
    expect(r('GET', '/fields/faiths')).toMatchObject({ controller: 'fields', action: 'faiths' });
    expect(r('GET', '/V1/users/:ref')).toMatchObject({ action: 'show' });
    // A '#' inside a quoted route target / comment does not break the line.
    expect(r('POST', '/V1/users/edit')).toMatchObject({ action: 'edit_profile' });
    // The catch-all glob never resolves a documented endpoint.
    expect(r('GET', '/bangalore745/irl')).toBeUndefined();
    expect(t.dynamic.map((d) => d.text).join(' ')).toMatch(/devise_for.*ActiveAdmin\.routes/);
  });

  test('UT-DRIFT-002 Controllers: require/permit, [], dig, fetch, helpers; comments ignored; hand-on → not determined', () => {
    const e = HEAD.endpoint('POST', '/V1/users/edit');
    const f = e.facts!;
    const names = f.params.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'user',
        'user.about',
        'user.height',
        'data.about',
        'data.user_traits',
        'mode',
        'newly',
      ]),
    );
    expect(names).not.toContain('commented_out');
    expect(f.params.find((p) => p.name === 'user')!.required).toBe(true);
    expect(f.params.find((p) => p.name === 'mode')!.required, 'fetch without default').toBe(true);
    expect(BASE.endpoint('POST', '/V1/users/edit').facts!.params.find((p) => p.name === 'age')!.type).toBe(
      'integer',
    );
    expect(f.paramsComplete).toBe(true);
    expect(f.responseComplete).toBe(true);
    expect(f.responseKeys.map((k) => k.name)).toEqual(['status', 'user', 'user_id', 'newly']);
    // Helper with an argument: required_param('user_id') → required user_id; error renders are not success keys.
    const r = HEAD.endpoint('GET', '/V1/pii_integration/first_name').facts!;
    expect(r.params).toEqual([expect.objectContaining({ name: 'user_id', required: true })]);
    expect(r.responseKeys.map((k) => k.name)).toEqual(['status', 'user_id', 'first_name']);
    // params handed on whole, a rendered variable: params and the full key set are not determined.
    const s = HEAD.endpoint('GET', '/V1/users/:ref').facts!;
    expect(s.paramsComplete).toBe(false);
    expect(s.review.join(' ')).toMatch(/passes all params to .*fetch_profile_info/);
    expect(s.responseComplete).toBe(false);
    expect(
      s.responseKeys.map((k) => k.name),
      'keys the action adds are still facts',
    ).toEqual(['intro_questions']);
    // Delegation to an argument-taking helper that reads the raw body.
    const p = HEAD.endpoint('POST', '/V1/api/v1/pii-test').facts!;
    expect(p.paramsComplete).toBe(false);
    expect(p.review.join(' ')).toMatch(/delegates to proxy_post/);
    // Lexer: string contents never open or close blocks.
    expect(rubyMethods('def a\n  x = "end do if"\nend\ndef b\nend\n').map((m) => [m.name, m.end])).toEqual([
      ['a', 3],
      ['b', 5],
    ]);
    expect(lexRuby("x = 'a # b' # comment")[0]!.code).toBe("x = 'a # b'");
    // Server-set params (from headers in a filter) are not request fields; self-referencing ones are.
    expect(names).not.toContain('ip_address');
  });

  test('UT-DRIFT-003 Compare: removed endpoint, new route listed, params added / removed / changed, fields added / removed', () => {
    const docs = [
      doc('API-001', 'GET', '/V1/pii_integration/first_name', ['user_id']),
      doc('API-002', 'POST', '/V1/pii_integration/first_name', ['user_id', 'first_name']),
      doc('API-010', 'POST', '/V1/users/edit', ['user', 'about', 'height', 'age', 'mode'], {
        responseFields: [
          { name: 'status', source: 'code' },
          { name: 'ref', source: 'code' },
        ],
      }),
      doc('API-011', 'POST', '/V1/users/legacy', []),
      doc('API-012', 'GET', '/V1/users/:ref', ['ref', 'documented_only']),
      doc('API-013', 'GET', '/bangalore745/irl', []),
    ];
    const r = compare(docs, HEAD, BASE, [RUN]);
    const find = (id: string, kind: string, name = '') =>
      r.findings.find((f) => f.apiId === id && f.kind === kind && f.name === name);
    expect(find('API-011', 'endpoint-removed')).toMatchObject({ confidence: 'high', source: 'code' });
    expect(find('API-011', 'endpoint-removed')!.evidence.join(' ')).toMatch(/routes\.rb:\d+ @base000/);
    const added = r.findings.filter((f) => f.kind === 'endpoint-added');
    expect(added.map((f) => `${f.method} ${f.path}`)).toEqual(['POST /V1/users/new_thing']);
    expect(
      added.every((f) => !applicable(f)),
      'new APIs are listed only',
    ).toBe(true);
    // Param added (new since BASE → high); one read at BASE too → medium; headers / path params are covered.
    expect(find('API-010', 'param-added', 'newly')).toMatchObject({
      confidence: 'high',
      after: { required: false },
    });
    expect(find('API-010', 'param-added', 'data.user_traits')).toMatchObject({ confidence: 'medium' });
    expect(find('API-010', 'param-added', 'data.about'), 'leaf "about" is documented').toBeUndefined();
    expect(find('API-012', 'param-added', 'ref')).toBeUndefined();
    // Param removed: BASE read age, HEAD (complete, static) does not.
    expect(find('API-010', 'param-removed', 'age')).toMatchObject({ confidence: 'high' });
    // Documented but never read statically at either ref → not a change.
    expect(find('API-012', 'param-removed', 'documented_only')).toBeUndefined();
    // Param changed: optional → required.
    expect(find('API-010', 'param-changed', 'mode')).toMatchObject({
      before: { required: false },
      after: { required: true },
    });
    // Response: HEAD's literal hash drops ref (BASE rendered it) → removed; user_id is new.
    expect(find('API-010', 'field-removed', 'ref')).toMatchObject({ confidence: 'high', source: 'code' });
    expect(find('API-010', 'field-added', 'user_id')).toMatchObject({ source: 'code', confidence: 'high' });
    // Staging wins: fields seen in 2xx answers; staging-only request fields → needs review.
    expect(find('API-002', 'field-added', 'ref')).toMatchObject({ source: 'staging', confidence: 'high' });
    expect(find('API-002', 'param-added', 'meta')).toMatchObject({ review: true, confidence: 'low' });
    expect(find('API-002', 'param-added', 'trace')).toMatchObject({ review: true });
    expect(find('API-002', 'param-added', 'meta.x'), 'nested keys follow their parent').toBeUndefined();
    // Routes generated by gems → not determined, never "removed".
    expect(find('API-013', 'endpoint-removed')).toBeUndefined();
    expect(r.notDetermined.find((n) => n.apiId === 'API-013')).toMatchObject({ what: 'route' });
    expect(r.notDetermined.find((n) => n.apiId === 'API-012' && n.what === 'params')).toBeTruthy();
    // The report lists every category and never invents a type.
    const md = reportMarkdown(r, '2026-10-29');
    expect(md).toContain('## Needs review (never applied)');
    expect(md).toContain('| POST | `/V1/users/new_thing` |');
    expect(md).toMatch(/Request param added.*`newly`/);
    expect(covered('Content-Type', new Set(['content_type']))).toBe(true);
  });

  test('UT-DRIFT-004 Staging run: 2xx only, names only (never values), id-keyed answers skipped', () => {
    const s = RUN.byEndpoint.get('API-002')!;
    expect(s.calls).toBe(1);
    expect([...s.request.keys()].sort()).toEqual(['first_name', 'meta', 'meta.x', 'trace', 'user_id']);
    expect([...s.response.keys()]).toEqual(['status', 'user_id', 'ref', 'first_name']);
    expect(JSON.stringify([...s.request.keys(), ...s.response.keys()])).not.toContain('QaUser');
    expect(RUN.byEndpoint.get('API-003')!.objectAnswers).toBe(0);
    expect(idKeyed(['12345678', 'DF5BDEF1'])).toBe(true);
    expect(idKeyed(['status'])).toBe(false);
    expect(RUN.date).toBe('2026-10-25');
  });

  test('UT-DRIFT-005 Apply is append-only and idempotent; needs-review items are never applied', () => {
    const docs = [
      doc('API-002', 'POST', '/V1/pii_integration/first_name', ['user_id', 'first_name']),
      doc('API-010', 'POST', '/V1/users/edit', ['user', 'about', 'height', 'age', 'mode']),
      doc('API-011', 'POST', '/V1/users/legacy', []),
    ];
    const r = compare(docs, HEAD, BASE, [RUN]);
    const log: ChangeLog = { about: '', changes: [], verified: {} };
    const first = appendChanges(log, toChanges(r, '2026-10-29'));
    expect(first.length).toBeGreaterThan(0);
    expect(
      first.some((c) => c.name === 'meta'),
      'needs-review item',
    ).toBe(false);
    expect(
      first.some((c) => c.name === 'users/new_thing' || c.apiId === ''),
      'new routes',
    ).toBe(false);
    expect(first.find((c) => c.name === 'ref' && c.apiId === 'API-002')!.date, 'staging date').toBe(
      '2026-10-25',
    );
    expect(first.find((c) => c.kind === 'endpoint-removed')!.date, 'code check date').toBe('2026-10-29');
    const again = appendChanges(log, toChanges(r, '2026-10-30'));
    expect(again, 're-running adds nothing').toEqual([]);
    expect(log.changes.length).toBe(first.length);
    // A later change in the other direction is recorded (toggle), then repeating it is not.
    const back: ApiChange = {
      ...first.find((c) => c.kind === 'endpoint-removed')!,
      kind: 'endpoint-restored',
    };
    expect(appendChanges(log, [back]).length).toBe(1);
    expect(appendChanges(log, [back]).length).toBe(0);
    markVerified(log, r, { code: ['API-002'], staging: new Map([['API-002', '2026-10-25']]) }, '2026-10-29');
    expect(log.verified['API-002']).toEqual({
      code: { date: '2026-10-29', ref: 'head000' },
      staging: { date: '2026-10-25' },
    });
  });

  test(`UT-DRIFT-006 Removed params / fields stay struck through for ${STRIKE_DAYS} days, then leave the body (history keeps them)`, () => {
    const log: ChangeLog = {
      about: '',
      verified: {
        'API-002': { code: { date: '2026-03-01', ref: 'abc1234' }, staging: { date: '2026-02-20' } },
      },
      changes: [
        {
          date: '2026-01-01',
          apiId: 'API-002',
          kind: 'param-removed',
          name: 'first_name',
          before: null,
          after: null,
          source: 'code',
          evidence: 'app/x.rb:1 @abc1234; second line',
        },
        {
          date: '2026-01-01',
          apiId: 'API-002',
          kind: 'field-added',
          name: 'ref',
          before: null,
          after: null,
          source: 'staging',
          evidence: 'staging run qa-auto-1 (2026-01-01), tests M2-X',
        },
        {
          date: '2026-01-02',
          apiId: 'API-002',
          kind: 'param-added',
          name: 'mode',
          before: null,
          after: { required: true },
          source: 'code',
          evidence: 'app/x.rb:9 @abc1234',
        },
      ],
    };
    const within = docState('API-002', ['user_id', 'first_name'], log, '2026-03-31'); // 89 days
    expect(within.params.find((p) => p.name === 'first_name')).toMatchObject({ removedOn: '2026-01-01' });
    expect(within.params.find((p) => p.name === 'mode')).toMatchObject({ required: true, source: 'code' });
    expect(
      within.params.find((p) => p.name === 'mode')!.type,
      'unknown type stays not stated',
    ).toBeUndefined();
    const after = docState('API-002', ['user_id', 'first_name'], log, '2026-04-02'); // 91 days
    expect(after.params.map((p) => p.name)).toEqual(['user_id', 'mode']);
    expect(after.history.map((h) => h.name)).toEqual(['first_name', 'ref', 'mode']);
    // Published evidence: code refs (first line only), never staging run / test ids.
    expect(after.history[0]!.ref).toBe('app/x.rb:1 @abc1234');
    expect(JSON.stringify(after)).not.toMatch(/qa-auto|M2-X/);
    expect(after.history[1]!.label).toBe('seen on staging 2026-01-01');
    expect(after.lastVerified).toEqual({ date: '2026-03-01', source: 'code', label: 'code @ abc1234' });
  });

  test('UT-DRIFT-007 Export merge: labelled params and fields, struck removals, removed endpoint kept but not counted', () => {
    const log: ChangeLog = {
      about: '',
      verified: { 'API-001': { staging: { date: '2026-10-25' } } },
      changes: [
        {
          date: '2026-10-20',
          apiId: 'API-002',
          kind: 'param-removed',
          name: 'first_name',
          before: null,
          after: null,
          source: 'code',
          evidence: 'app/controllers/v1/pii_integration_controller.rb:36 @004e72c',
        },
        {
          date: '2026-10-25',
          apiId: 'API-002',
          kind: 'field-added',
          name: 'ref',
          before: null,
          after: null,
          source: 'staging',
          evidence: 'staging run x',
        },
        {
          date: '2026-10-21',
          apiId: 'API-001',
          kind: 'endpoint-removed',
          name: '',
          before: null,
          after: null,
          source: 'code',
          evidence: 'config/routes.rb @004e72c: no route',
        },
      ],
    };
    const plain = build({ log: { about: '', changes: [], verified: {} }, today: '2026-10-29' });
    const data = build({ log, today: '2026-10-29' });
    expect(data.apis.length).toBe(plain.apis.length);
    expect(data.live.length, 'removed endpoint left out of the counts').toBe(plain.live.length - 1);
    const a2 = data.apis.find((a) => a.id === 'API-002')!;
    expect(a2.keys).toEqual(['user_id']);
    expect(a2.params.find((p) => p.name === 'first_name')).toMatchObject({ removedOn: '2026-10-20' });
    expect(a2.responseFields).toEqual([
      expect.objectContaining({ name: 'ref', source: 'staging', label: 'seen on staging 2026-10-25' }),
    ]);
    const a1 = data.apis.find((a) => a.id === 'API-001')!;
    expect(a1.removed).toMatchObject({ on: '2026-10-21', label: 'from code — confirm with Dev' });
    expect(a1.lastVerified).toMatchObject({ date: '2026-10-25', source: 'staging' });
    const md = markdown(data, guides(data));
    expect(md).toContain('~~`first_name`~~ (removed on 2026-10-20');
    expect(md).toContain('**Removed on 2026-10-21**');
    expect(md).toContain('**What changed**');
    expect(md).toMatch(/- `ref` \(seen on staging 2026-10-25\)/);
    expect(md).not.toMatch(/staging run x|M2Q-|BQ-\d/);
    // Without recorded changes the export is unchanged in shape: keys = Dev's request keys, nothing extra.
    const p2 = plain.apis.find((a) => a.id === 'API-002')!;
    expect(p2.keys).toEqual(['user_id', 'first_name']);
    expect(p2.history).toEqual([]);
    expect(p2.removed).toBeUndefined();
  });

  test('UT-DRIFT-008 Shared prompt: change/removal rule present; master skill generated verbatim from its sections', () => {
    const prompt = readFileSync(path.join(ROOT, 'docs/shared-api-docs-prompt.md'), 'utf8');
    expect(prompt).toContain('## 5A. When an API changes or is removed');
    expect(prompt).toMatch(/<!-- api-guide-rule:start -->[\s\S]+<!-- api-guide-rule:end -->/);
    const skill = masterSkill(prompt);
    expect(skill.startsWith('---\nname: api-guide-docs\n')).toBe(true);
    expect(skill).toContain('## 5A. When an API changes or is removed');
    expect(skill).toContain('## 10. Stop and ask me when');
    expect(skill).not.toContain('### 3.1 Discover');
    expect(skill).not.toContain('## 8. STANDING RULE');
    expect(skill).not.toContain('You will (1)');
    const s5a = prompt.slice(prompt.indexOf('## 5A.'), prompt.indexOf('## 6.'));
    expect(skill).toContain(s5a.trim());
  });

  test('UT-DRIFT-009 Code-discovered routes are docs-only: literal facts, "not stated" unknowns, no inventory / test case', () => {
    const docs = [doc('API-010', 'POST', '/V1/users/edit', ['user'])];
    const r = compare(docs, HEAD, BASE, []);
    const routes = codeRoutesFrom(
      r.findings,
      HEAD,
      [{ path: '/V1/users/edit', group: 'G2', controller: 'v1/users' }],
      [],
      '2026-10-29',
    );
    expect(routes).toEqual([
      expect.objectContaining({
        id: 'CODE-001',
        method: 'POST',
        path: '/V1/users/new_thing',
        controller: 'v1/users',
        action: 'new_thing',
        sha: 'head000',
        group: 'G2',
        params: [],
        responseKeys: [expect.objectContaining({ name: 'done' })],
        responseComplete: true,
      }),
    ]);
    // Ids are kept across runs; nothing is added twice.
    expect(codeRoutesFrom(r.findings, HEAD, [], routes, '2026-10-30')).toEqual(routes);
    // Area from the path only: webhook / callback → provider callbacks; else the documented routes under the same prefix.
    expect(areaFor({ method: 'POST', path: '/V1/payment/x/webhook', controller: 'v1/payment' }, [])).toBe(
      'G9',
    );
    expect(
      areaFor({ method: 'POST', path: '/admin/members/new', controller: 'admin/members' }, [
        { path: '/admin/member/search', group: 'G10' },
      ]),
    ).toBe('G10');
    const md = codeRoutesMarkdown({ about: '', routes }, (k) => (k === 'G2' ? 'Sign-up' : ''));
    expect(md).toContain('| CODE-001 | POST | `/V1/users/new_thing` | Sign-up | `v1/users#new_thing` |');
    // Export: docs-only entries with unknowns "not stated"; never in the M2 inventory (no group, no test case).
    const data = build({
      log: { about: '', changes: [], verified: {} },
      today: '2026-10-29',
      codeRoutes: routes,
    });
    const e = data.apis.find((a) => a.id === 'CODE-001')! as (typeof data.apis)[number] & {
      docsOnly?: boolean;
    };
    expect(e).toMatchObject({
      docsOnly: true,
      auth: 'not stated',
      caller: 'not stated',
      fields: [],
      stores: [],
      flows: [],
    });
    expect(e.responseFields).toEqual([expect.objectContaining({ name: 'done', source: 'code' })]);
    expect(e.notes[0]!.text).toMatch(/config\/routes\.rb:\d+` @head000/);
    expect(parseInventory(ROOT).some((a) => a.path === '/V1/users/new_thing')).toBe(false);
  });
});
