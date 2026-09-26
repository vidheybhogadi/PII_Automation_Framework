/** Bundles the dashboard (Preact + CSS + fonts) into static assets with esbuild. */
import { build, context, type BuildOptions } from 'esbuild';
import path from 'node:path';

export const DASHBOARD_ENTRY = path.resolve(__dirname, '../dashboard/src/main.tsx');

export function bundleOptions(outDir: string, dev = false): BuildOptions {
  return {
    entryPoints: { app: DASHBOARD_ENTRY },
    outdir: path.join(outDir, 'assets'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110', 'safari16', 'firefox115', 'edge110'],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.woff2': 'file' },
    assetNames: 'fonts/[name]',
    legalComments: 'none',
    define: { __DEV__: dev ? 'true' : 'false' },
    logLevel: 'warning',
  };
}

export async function bundleDashboard(outDir: string): Promise<void> {
  await build(bundleOptions(outDir));
}

export async function watchDashboard(outDir: string) {
  const ctx = await context(bundleOptions(outDir, true));
  await ctx.watch();
  return ctx;
}
