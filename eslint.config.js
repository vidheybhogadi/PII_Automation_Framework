// ESLint "flat config" (ESLint 9+). typescript-eslint adds TypeScript-aware rules.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/',
      'reports/',
      'test-results/',
      'playwright-report/',
      'reporting/dashboard/dist/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // console.* bypasses the redacting logger. Only src/utils/logger.ts and scripts/ may use it.
      'no-console': 'error',
    },
  },
  {
    // Dashboard runs in the browser.
    files: ['reporting/dashboard/**/*.{ts,tsx}', 'reporting/templates/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // CLIs print progress to the terminal.
    files: ['src/utils/logger.ts', 'scripts/**', 'reporting/generator/**', 'reporting/fixtures/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // Playwright fixtures must destructure their first argument even when it is unused: `async ({}, use) => ...`
    files: ['src/fixtures/**'],
    rules: { 'no-empty-pattern': 'off' },
  },
  {
    files: ['eslint.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
