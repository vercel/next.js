# Next.js Development Guide

> **Note:** `CLAUDE.md` is a symlink to `AGENTS.md`. They are the same file.

## Codebase structure

### Monorepo Overview

This is a pnpm monorepo containing the Next.js framework and related packages.

```
next.js/
├── packages/           # Published npm packages
├── turbopack/          # Turbopack bundler (Rust) - git subtree
├── crates/             # Rust crates for Next.js SWC bindings
├── test/               # All test suites
├── examples/           # Example Next.js applications
├── docs/               # Documentation
└── scripts/            # Build and maintenance scripts
```

### Core Package: `packages/next`

The main Next.js framework lives in `packages/next/`. This is what gets published as the `next` npm package.

**Source code** is in `packages/next/src/`.

**Key entry points:**

- Dev server: `src/cli/next-dev.ts` → `src/server/dev/next-dev-server.ts`
- Production server: `src/cli/next-start.ts` → `src/server/next-server.ts`
- Build: `src/cli/next-build.ts` → `src/build/index.ts`

**Compiled output** goes to `packages/next/dist/` (mirrors src/ structure).

### Other Important Packages

- `packages/create-next-app/` - The `create-next-app` CLI tool
- `packages/next-swc/` - Native Rust bindings (SWC transforms)
- `packages/eslint-plugin-next/` - ESLint rules for Next.js
- `packages/font/` - `next/font` implementation
- `packages/third-parties/` - Third-party script integrations

### README files

Before editing or creating files in any subdirectory (e.g., `packages/*`, `crates/*`), read all `README.md` files in the directory path from the repo root up to and including the target file's directory. This helps identify any local patterns, conventions, and documentation.

**Example:** Before editing `turbopack/crates/turbopack-ecmascript-runtime/js/src/nodejs/runtime/runtime-base.ts`, read:

- `turbopack/README.md` (if exists)
- `turbopack/crates/README.md` (if exists)
- `turbopack/crates/turbopack-ecmascript-runtime/README.md` (if exists)
- `turbopack/crates/turbopack-ecmascript-runtime/js/README.md` (if exists - closest to target file)

## Build Commands

```bash
# Build the Next.js package
pnpm --filter=next build

# Build everything
pnpm build

# Run specific task
pnpm --filter=next exec taskr <task>
```

## Fast Local Development

For iterative development, default to watch mode + skip-isolate for the inner loop (not full builds), with exceptions noted below.

**Default agent rule:** If you are changing Next.js source or integration tests, start `pnpm --filter=next dev` in a separate terminal session before making edits (unless it is already running). If you skip this, explicitly state why (for example: docs-only, read-only investigation, or CI-only analysis).

**1. Start watch build in background:**

```bash
# Auto-rebuilds on file changes (~1-2s per change vs ~60s full build)
# Keep this running while you iterate on code
pnpm --filter=next dev
```

**2. Run tests fast (no isolation, no packing):**

```bash
# NEXT_SKIP_ISOLATE=1 - skip packing Next.js for each test (~100s faster)
# testonly - runs with --runInBand (no worker isolation overhead)
NEXT_SKIP_ISOLATE=1 NEXT_TEST_MODE=dev pnpm testonly test/path/to/test.ts
```

**3. When done, kill the background watch process (if you started it).**

**For type errors only:** Use `pnpm --filter=next types` (~10s) instead of `pnpm --filter=next build` (~60s).

After the workspace is bootstrapped, prefer `pnpm --filter=next build` when edits are limited to core Next.js files. Use full `pnpm build` for branch switches/bootstrap, before CI push, or when changes span multiple packages.

**Always run a full bootstrap build after switching branches:**

```bash
git checkout <branch>
pnpm build   # Sets up outputs for dependent packages (Turborepo dedupes if unchanged)
```

**When NOT to use NEXT_SKIP_ISOLATE:** Drop it when testing module resolution changes (new require() paths, new exports from entry-base.ts, edge route imports). Without isolation, the test uses local dist/ directly, hiding resolution failures that occur when Next.js is packed as a real npm package.

## Bundler Selection

Turbopack is the default bundler for both `next dev` and `next build`. To force webpack:

```bash
next build --webpack        # Production build with webpack
next dev --webpack          # Dev server with webpack
```

There is no `--no-turbopack` flag.

## Testing

```bash
# Run specific test file (development mode with Turbopack)
pnpm test-dev-turbo test/path/to/test.test.ts

# Run tests matching pattern
pnpm test-dev-turbo -t "pattern"

# Run development tests
pnpm test-dev-turbo test/development/
```

**Test commands by mode:**

- `pnpm test-dev-turbo` - Development mode with Turbopack (default)
- `pnpm test-dev-webpack` - Development mode with Webpack
- `pnpm test-start-turbo` - Production build+start with Turbopack
- `pnpm test-start-webpack` - Production build+start with Webpack

**Other test commands:**

- `pnpm test-unit` - Run unit tests only (fast, no browser)
- `pnpm testonly <path>` - Run tests without rebuilding (faster iteration when build artifacts are already up to date)
- `pnpm new-test` - Generate a new test file from template (interactive)

**Generate tests non-interactively (for AI agents):**

Generating tests using `pnpm new-test` is mandatory.

```bash
# Use --args for non-interactive mode
# Format: pnpm new-test --args <appDir> <name> <type>
# appDir: true/false (is this for app directory?)
# name: test name (e.g. "my-feature")
# type: e2e | production | development | unit

pnpm new-test --args true my-feature e2e
```

**Analyzing test output efficiently:**

Never re-run the same test suite with different grep filters. Capture output once to a file, then read from it:

```bash
# Run once, save everything
HEADLESS=true pnpm test-dev-turbo test/path/to/test.ts > /tmp/test-output.log 2>&1

# Then analyze without re-running
grep "●" /tmp/test-output.log            # Failed test names
grep -A5 "Error:" /tmp/test-output.log   # Error details
tail -5 /tmp/test-output.log             # Summary
```

## Writing Tests

**Test writing expectations:**

- **Use `pnpm new-test` to generate new test suites** - it creates proper structure with fixture files

- **Use `retry()` from `next-test-utils` instead of `setTimeout` for waiting**

  ```typescript
  // Good - use retry() for polling/waiting
  import { retry } from 'next-test-utils'
  await retry(async () => {
    const text = await browser.elementByCss('p').text()
    expect(text).toBe('expected value')
  })

  // Bad - don't use setTimeout for waiting
  await new Promise((resolve) => setTimeout(resolve, 1000))
  ```

- **Do NOT use `check()` - it is deprecated. Use `retry()` + `expect()` instead**

  ```typescript
  // Deprecated - don't use check()
  await check(() => browser.elementByCss('p').text(), /expected/)

  // Good - use retry() with expect()
  await retry(async () => {
    const text = await browser.elementByCss('p').text()
    expect(text).toMatch(/expected/)
  })
  ```

- **Prefer real fixture directories over inline `files` objects**

  ```typescript
  // Good - use a real directory with fixture files
  const { next } = nextTestSetup({
    files: __dirname, // points to directory containing test fixtures
  })

  // Avoid - inline file definitions are harder to maintain
  const { next } = nextTestSetup({
    files: {
      'app/page.tsx': `export default function Page() { ... }`,
    },
  })
  ```

## Linting and Types

```bash
pnpm lint              # Full lint (types, prettier, eslint, ast-grep)
pnpm lint-fix          # Auto-fix lint issues
pnpm prettier-fix      # Fix formatting only
pnpm types             # TypeScript type checking
```

## PR Status (CI Failures and Reviews)

When the user asks about CI failures, PR reviews, or the status of a PR, run the pr-status script:

```bash
node scripts/pr-status.js           # Auto-detects PR from current branch
node scripts/pr-status.js <number>  # Analyze specific PR by number
```

This generates analysis files in `scripts/pr-status/`.

General triage rules (always apply; `$pr-status-triage` skill expands on these):

- Prioritize blocking failures first: build, lint, types, then tests.
- Assume failures are real until disproven; use "Known Flaky Tests" as context, not auto-dismissal.
- Reproduce with the same CI mode/env vars (especially `IS_WEBPACK_TEST=1` when present).
- For module-resolution/build-graph fixes, verify without `NEXT_SKIP_ISOLATE=1`.

For full triage workflow (failure prioritization, mode selection, CI env reproduction, and common failure patterns), use the `$pr-status-triage` skill:

- Skill file: `.agents/skills/pr-status-triage/SKILL.md`

**Use `/pr-status` for automated analysis** - analyzes failing jobs and review comments in parallel, groups failures by test file.

**CI Analysis Tips:**

- Prioritize CI failures over review comments
- Prioritize blocking jobs first: build, lint, types, then test jobs
- Common fast checks:
  - `rust check / build` → Run `cargo fmt -- --check`, then `cargo fmt`
  - `lint / build` → Run `pnpm prettier --write <file>` for prettier errors
  - test failures → Run the specific failing test path locally

**Run tests in the right mode:**

```bash
# Dev mode (Turbopack)
pnpm test-dev-turbo test/path/to/test.ts

# Prod mode
pnpm test-start-turbo test/path/to/test.ts
```

## Key Directories (Quick Reference)

See [Codebase structure](#codebase-structure) above for detailed explanations.

- `packages/next/src/` - Main Next.js source code
- `packages/next/src/server/` - Server runtime (most changes happen here)
- `packages/next/src/client/` - Client-side runtime
- `packages/next/src/build/` - Build tooling
- `test/e2e/` - End-to-end tests
- `test/development/` - Dev server tests
- `test/production/` - Production build tests
- `test/unit/` - Unit tests (fast, no browser)

## Development Tips

- The dev server entry point is `packages/next/src/cli/next-dev.ts`
- Router server: `packages/next/src/server/lib/router-server.ts`
- Use `DEBUG=next:*` for debug logging
- Use `NEXT_TELEMETRY_DISABLED=1` when testing locally

### `NODE_ENV` vs `__NEXT_DEV_SERVER`

Both `next dev` and `next build --debug-prerender` produce bundles with `NODE_ENV=development`. Use `process.env.__NEXT_DEV_SERVER` to distinguish between them:

- `process.env.NODE_ENV !== 'production'` — code that should exist in dev bundles but be eliminated from prod bundles. This is a build-time check.
- `process.env.__NEXT_DEV_SERVER` — code that should only run with the dev server (`next dev`), not during `next build --debug-prerender` or `next start`.

## Secrets and Env Safety

Always treat environment variable values as sensitive unless they are known test-mode flags.

- Never print or paste secret values (tokens, API keys, cookies) in chat responses, commits, or shared logs.
- Mirror CI env **names and modes** exactly, but do not inline literal secret values in commands.
- If a required secret is missing locally, stop and ask the user rather than inventing placeholder credentials.
- Never commit local secret files; if documenting env setup, use placeholder-only examples.
- When sharing command output, summarize and redact sensitive-looking values.

## Specialized Skills

Use skills for conditional, deep workflows. Keep baseline iteration/build/test policy in this file.

- `$pr-status-triage` - CI failure and PR review triage with `scripts/pr-status.js`
- `$flags` - feature-flag wiring across config/schema/define-env/runtime env
- `$dce-edge` - DCE-safe `require()` patterns and edge/runtime constraints
- `$react-vendoring` - `entry-base.ts` boundaries and vendored React type/runtime rules
- `$runtime-debug` - runtime-bundle/module-resolution regression reproduction and verification
- `$authoring-skills` - how to create and maintain skills in `.agents/skills/`

## Context-Efficient Workflows

**Reading large files** (>500 lines, e.g. `app-render.tsx`):

- Grep first to find relevant line numbers, then read targeted ranges with `offset`/`limit`
- Never re-read the same section of a file without code changes in between
- For generated files (`dist/`, `node_modules/`, `.next/`): search only, don't read

**Build & test output:**

- Capture to file once, then analyze: `pnpm build 2>&1 | tee /tmp/build.log`
- Don't re-run the same test command without code changes; re-analyze saved output instead

**Batch edits before building:**

- Group related edits across files, then run one build, not build-per-edit
- Use `pnpm --filter=next types` (~10s) to check type errors without full rebuild

**External API calls (gh, curl):**

- Save response to variable or file: `JOBS=$(gh api ...) && echo "$JOBS" | jq '...'`
- Don't re-fetch the same API data to analyze from different angles

## Commit and PR Style

- Do NOT add "Generated with Claude Code" or co-author footers to commits or PRs
- Keep commit messages concise and descriptive
- PR descriptions should focus on what changed and why
- Do NOT mark PRs as "ready for review" (`gh pr ready`) - leave PRs in draft mode and let the user decide when to mark them ready

## Task Decomposition and Verification

- **Split work into smaller, individually verifiable tasks.** Before starting, break the overall goal into incremental steps where each step produces a result that can be checked independently.
- **Verify each task before moving on to the next.** After completing a step, confirm it works correctly (e.g., run relevant tests, check types, build, or manually inspect output). Do not proceed to the next task until the current one is verified.
- **Choose the right verification method for each change.** This may include running unit tests, integration tests, type checking, linting, building the project, or inspecting runtime behavior depending on what was changed.
- **When unclear how to verify a change, ask the user.** If there is no obvious test or verification method for a particular change, ask the user how they would like it verified before moving on.

**Pre-validate before committing** to avoid slow lint-staged failures (~2 min each):

```bash
# Run exactly what the pre-commit hook runs on your changed files:
pnpm prettier --with-node-modules --ignore-path .prettierignore --write <files>
npx eslint --config eslint.config.mjs --fix <files>
```

## Rebuilding Before Running Tests

When running Next.js integration tests, you must rebuild if source files have changed:

- **First run after branch switch/bootstrap (or if unsure)?** → `pnpm build`
- **Edited only core Next.js files (`packages/next/**`) after bootstrap?** → `pnpm --filter=next build`
- **Edited Next.js code or Turbopack (Rust)?** → `pnpm build`

## Development Anti-Patterns

For runtime internals, use focused skills:

- Feature-flag plumbing and runtime bundle wiring: `$flags` (`.agents/skills/flags/SKILL.md`)
- DCE and edge/runtime constraints: `$dce-edge` (`.agents/skills/dce-edge/SKILL.md`)
- React vendoring and `entry-base.ts` boundaries: `$react-vendoring` (`.agents/skills/react-vendoring/SKILL.md`)
- Debugging and verification workflow: `$runtime-debug` (`.agents/skills/runtime-debug/SKILL.md`)

Keep these high-frequency guardrails in mind:

- Reproduce module resolution and bundling issues without `NEXT_SKIP_ISOLATE=1`
- Validate edge bundling regressions with `pnpm test-start-webpack test/e2e/app-dir/app/standalone.test.ts`
- Use `__NEXT_SHOW_IGNORE_LISTED=true` when you need full internal stack traces

Core runtime/bundling rules (always apply; skills above expand on these with verification steps and examples):

- New flags: add type in `config-shared.ts`, schema in `config-schema.ts`, and `define-env.ts` when used in user-bundled code.
- If a flag is consumed in pre-compiled runtime internals, also wire runtime env values (`next-server.ts`/`export/worker.ts` as needed).
- `define-env.ts` affects user bundling; it does not control pre-compiled runtime bundle internals.
- Keep `require()` behind compile-time `if/else` branches for DCE (avoid early-return/throw patterns).
- In edge builds, force feature flags that gate Node-only imports to `false` in `define-env.ts`.
- `react-server-dom-webpack/*` imports must stay in `entry-base.ts`; consume via component module exports elsewhere.

### Test Gotchas

- **Cache components enables PPR by default**: When `__NEXT_CACHE_COMPONENTS=true`, most app-dir pages use PPR implicitly. Dedicated `ppr-full/` and `ppr/` test suites are mostly `describe.skip` (migrating to cache components). To test PPR codepaths, run normal app-dir e2e tests with `__NEXT_CACHE_COMPONENTS=true` rather than looking for explicit PPR test suites.
- **Quick smoke testing with toy apps**: For fast feedback, generate a minimal test fixture with `pnpm new-test --args true <name> e2e`, then run the dev server directly with `node packages/next/dist/bin/next dev --port <port>` and `curl --max-time 10`. This avoids the overhead of the full test harness and gives immediate feedback on hangs/crashes.
- Mode-specific tests need `skipStart: true` + manual `next.start()` in `beforeAll` after mode check
- Don't rely on exact log messages - filter by content patterns, find sequences not positions
- **Snapshot tests vary by env flags**: Tests with inline snapshots can produce different output depending on env flags. When updating snapshots, always run the test with the exact env flags the CI job uses (check `.github/workflows/build_and_test.yml` `afterBuild:` sections). Turbopack resolves `react-dom/server.edge` (no Node APIs like `renderToPipeableStream`), while webpack resolves the `.node` build (has them).
- **`app-page.ts` is a build template compiled by the user's bundler**: Any `require()` in this file is traced by webpack/turbopack at `next build` time. You cannot require internal modules with relative paths because they won't be resolvable from the user's project. Instead, export new helpers from `entry-base.ts` and access them via `entryBase.*` in the template.
- **Reproducing CI failures locally**: Always match the exact CI env vars (check `pr-status` output for "Job Environment Variables"). Key differences: `IS_WEBPACK_TEST=1` forces webpack (turbopack is default), `NEXT_SKIP_ISOLATE=1` skips packing next.js (hides module resolution failures). Always run without `NEXT_SKIP_ISOLATE` when verifying module resolution fixes.
- **Showing full stack traces**: Set `__NEXT_SHOW_IGNORE_LISTED=true` to disable the ignore-list filtering in dev server error output. By default, Next.js collapses internal frames to `at ignore-listed frames`, which hides useful context when debugging framework internals. Defined in `packages/next/src/server/patch-error-inspect.ts`.

### Rust/Cargo

- cargo fmt uses ASCII order (uppercase before lowercase) - just run `cargo fmt`
- **Internal compiler error (ICE)?** Delete incremental compilation artifacts and retry. Remove `*/incremental` directories from your cargo target directory (default `target/`, or check `CARGO_TARGET_DIR` env var)

### Node.js Source Maps

- `findSourceMap()` needs `--enable-source-maps` flag or returns undefined
- Source map paths vary (webpack: `./src/`, tsc: `src/`) - try multiple formats
- `process.cwd()` in stack trace formatting produces different paths in tests vs production

### Stale Native Binary

If Turbopack produces unexpected errors after switching branches or pulling, check if `packages/next-swc/native/*.node` is stale. Delete it and run `pnpm install` to get the npm-published binary instead of a locally-built one.

### Documentation Code Blocks

- When adding `highlight={...}` attributes to code blocks, carefully count the actual line numbers within the code block
- Account for empty lines, import statements, and type imports that shift line numbers
- Highlights should point to the actual relevant code, not unrelated lines like `return (` or framework boilerplate
- Double-check highlights by counting lines from 1 within each code block
