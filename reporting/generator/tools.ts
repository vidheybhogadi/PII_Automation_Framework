/**
 * Small report utilities:
 *   tsx reporting/generator/tools.ts dev     # live-reloading dashboard dev server with DEMO data
 *   tsx reporting/generator/tools.ts build   # bundle dashboard assets only (sanity check)
 *   tsx reporting/generator/tools.ts open [--demo]
 *   tsx reporting/generator/tools.ts clean [--all]    (--all also removes run history)
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { bundleDashboard, watchDashboard } from './bundle';
import { generate, PATHS, ROOT } from './generate';

function openFile(file: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'dev': {
      const out = path.join(ROOT, 'reports/dev-report');
      await generate({ demo: true, out, bundle: false, quiet: true });
      const ctx = await watchDashboard(out);
      const { port } = await ctx.serve({ servedir: out, port: Number(process.env.PORT ?? 5173) });
      console.log(
        `\n  PII Sentinel dev server (DEMO data): http://localhost:${port}/\n  Edit reporting/dashboard/src — the page reloads automatically. Ctrl+C to stop.\n`,
      );
      break;
    }
    case 'build': {
      const out = path.join(ROOT, 'reporting/dashboard/dist');
      await bundleDashboard(out);
      console.log(`  Dashboard assets bundled into ${path.relative(ROOT, out)}/assets`);
      break;
    }
    case 'open': {
      const file = path.join(rest.includes('--demo') ? PATHS.demoOut : PATHS.out, 'index.html');
      if (!existsSync(file))
        throw new Error(
          `${path.relative(ROOT, file)} does not exist — run npm run report${rest.includes('--demo') ? ':demo' : ''} first.`,
        );
      openFile(file);
      console.log(`  Opened ${path.relative(ROOT, file)}`);
      break;
    }
    case 'clean': {
      const targets = [
        PATHS.out,
        PATHS.demoOut,
        path.join(ROOT, 'reports/dev-report'),
        path.join(ROOT, 'reporting/dashboard/dist'),
      ];
      if (rest.includes('--all')) targets.push(PATHS.history, PATHS.archive);
      for (const t of targets) rmSync(t, { recursive: true, force: true });
      console.log(
        `  Removed: ${targets.map((t) => path.relative(ROOT, t)).join(', ')}${rest.includes('--all') ? '' : '\n  (history kept — use --all to remove it)'}`,
      );
      break;
    }
    default:
      throw new Error('Usage: tools.ts dev | build | open [--demo] | clean [--all]');
  }
}

main().catch((e: Error) => {
  console.error(`✘ ${e.message}`);
  process.exit(1);
});
