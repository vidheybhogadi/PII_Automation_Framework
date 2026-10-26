/**
 * Publishes the Aisle API documentation to the API_Guide repository (https://github.com/vidheybhogadi/API_Guide);
 * Netlify rebuilds the website on every push to main.
 *
 *   API_DOCS_REPO_DIR=/path/to/API_Guide npm run docs:api:publish
 *
 * Exports the content (content/api-data.json + API-Documentation.md, plus content/shared-api-docs-prompt.md — the
 * standing documentation prompt from docs/shared-api-docs-prompt.md, offered by the site's "Copy prompt" button) into
 * the clone, checks that the site builds
 * there (node build.mjs), then commits and pushes only if the content changed. The website code (src/, build.mjs) is
 * owned by the API_Guide repo and is never touched here. API_DOCS_REPO_DIR can also be set in .env.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
const repo = process.env.API_DOCS_REPO_DIR?.trim();

const git = (...args: string[]) => execFileSync('git', ['-C', repo!, ...args], { encoding: 'utf8' }).trim();

function main() {
  if (!repo)
    throw new Error(
      'Set API_DOCS_REPO_DIR to the local clone of the API_Guide repository (in .env or the shell).',
    );
  if (!existsSync(path.join(repo, '.git'))) throw new Error(`${repo} is not a git clone.`);
  if (!existsSync(path.join(repo, 'build.mjs')))
    throw new Error(`${repo} has no build.mjs — is it the API_Guide repo?`);
  if (path.resolve(repo) === ROOT) throw new Error('API_DOCS_REPO_DIR points at this automation repository.');

  git('pull', '--ff-only');
  execFileSync('npx', ['tsx', path.join(__dirname, 'export.ts'), '--out', repo], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  const prompt = path.join(ROOT, 'docs/shared-api-docs-prompt.md');
  if (existsSync(prompt)) copyFileSync(prompt, path.join(repo, 'content/shared-api-docs-prompt.md'));
  execFileSync('node', ['build.mjs'], { cwd: repo, stdio: 'inherit' });

  if (!git('status', '--porcelain', '--', 'content', 'API-Documentation.md')) {
    console.log('API docs: no content changes to publish.');
    return;
  }
  git('add', '--', 'content', 'API-Documentation.md');
  git('commit', '-m', `Update API documentation content (${new Date().toISOString().slice(0, 10)})`);
  git('push', 'origin', 'HEAD:main');
  console.log(`API docs: pushed to ${git('remote', 'get-url', 'origin')} — Netlify will redeploy.`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
