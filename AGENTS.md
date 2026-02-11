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

For iterative development, always use watch mode + skip-isolate (not full builds):

**1. Start watch build in background:**

```bash
# Auto-rebuilds on file changes (~1-2s per change vs ~60s full build)
# Use Bash(run_in_background=true) to keep working while it runs
pnpm --filter=next dev
```

**2. Run tests fast (no isolation, no packing):**

```bash
# NEXT_SKIP_ISOLATE=1 - skip packing Next.js for each test (~100s faster)
# testonly - runs with --runInBand (no worker isolation overhead)
NEXT_SKIP_ISOLATE=1 NEXT_TEST_MODE=dev pnpm testonly test/path/to/test.ts
```

**3. When done, kill the background watch process.**

**For type errors only:** Use `pnpm --filter=next types` (~10s) instead of full `pnpm --filter=next build` (~60s).

Only use full `pnpm --filter=next build` for: branch switches, before CI push, or runtime bundle changes (taskfile.js / next-runtime.webpack-config.js).

**Always rebuild after switching branches:**

```bash
git checkout <branch>
pnpm build   # Required before running tests (Turborepo dedupes if unchanged)
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

**Run tests headless** (no browser window): Set `HEADLESS=true` when running e2e tests unless you need visual browser debugging:

```bash
HEADLESS=true pnpm test-dev-turbo test/path/to/test.ts
```

**Other test commands:**

- `pnpm test-unit` - Run unit tests only (fast, no browser)
- `pnpm testonly <path>` - Run tests without rebuilding (faster iteration)
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

This fetches CI workflow runs, failed jobs, logs, and PR review comments, generating markdown files in `scripts/pr-status/`.

**Use `/pr-status` for automated analysis** - analyzes failing jobs and review comments in parallel, groups failures by test file.

**CI Analysis Tips:**

- **Assume test failures are NOT flaky by default.** Investigate every failure as if it is caused by the current changes until proven otherwise. However, check the **Known Flaky Tests** section in pr-status output for historical data before deep-diving into a failure.
- Prioritize blocking jobs first: build, lint, types, then test jobs
- Prioritize CI failures over review comments

**Common failure patterns:**

- `rust check / build` → Run `cargo fmt -- --check` locally, fix with `cargo fmt`
- `lint / build` → Run `pnpm prettier --write <file>` for prettier errors
- Test failures → Run the specific test locally with `pnpm test-dev-turbo <test-path>`

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

- **Edited Next.js code?** → `pnpm build`
- **Edited Turbopack (Rust)?** → `pnpm swc-build-native`
- **Edited both?** → `pnpm turbo build build-native`

## Development Anti-Patterns

### Adding Experimental Flags

All flags need: `config-shared.ts` (type) → `config-schema.ts` (zod). If the flag is consumed in user-bundled code (client components, edge routes, `app-page.ts` template), also add it to `define-env.ts` for build-time injection. Runtime-only flags consumed exclusively in pre-compiled bundles can skip `define-env.ts`.

Beyond that, it depends on where the flag is consumed:

**Client/bundled code only** (e.g. `__NEXT_PPR` in client components): `define-env.ts` is sufficient. Webpack/Turbopack replaces `process.env.X` at the user's build time.

**Pre-compiled runtime bundles** (e.g. code in `app-render.tsx`): The flag must also be set as a real `process.env` var at runtime, because `app-render.tsx` runs from pre-compiled bundles where `define-env.ts` doesn't reach. Two approaches:

- **Runtime env var**: Set in `next-server.ts` + `export/worker.ts`. Both code paths stay in one bundle. Simple but increases bundle size.
- **Separate bundle variant**: Add DefinePlugin entry in `next-runtime.webpack-config.js` (scoped to `bundleType === 'app'`), new taskfile tasks, update `module.compiled.js` selector, and still set env var in `next-server.ts` + `export/worker.ts` for bundle selection. Eliminates dead code but adds build complexity.

For runtime flags, also add the field to the `NextConfigRuntime` Pick type in `config-shared.ts`.

### Test Gotchas

- **Cache components enables PPR by default**: When `__NEXT_CACHE_COMPONENTS=true`, most app-dir pages use PPR implicitly. Dedicated `ppr-full/` and `ppr/` test suites are mostly `describe.skip` (migrating to cache components). To test PPR codepaths, run normal app-dir e2e tests with `__NEXT_CACHE_COMPONENTS=true` rather than looking for explicit PPR test suites.
- **Quick smoke testing with toy apps**: For fast feedback, generate a minimal test fixture with `pnpm new-test --args true <name> e2e`, then run the dev server directly with `node packages/next/dist/bin/next dev --port <port>` and `curl --max-time 10`. This avoids the overhead of the full test harness and gives immediate feedback on hangs/crashes.
- Mode-specific tests need `skipStart: true` + manual `next.start()` in `beforeAll` after mode check
- Don't rely on exact log messages - filter by content patterns, find sequences not positions
- **Snapshot tests vary by env flags**: Tests with inline snapshots can produce different output depending on env flags. When updating snapshots, always run the test with the exact env flags the CI job uses (check `.github/workflows/build_and_test.yml` `afterBuild:` sections). Turbopack resolves `react-dom/server.edge` (no Node APIs like `renderToPipeableStream`), while webpack resolves the `.node` build (has them).
- **`app-page.ts` is a build template compiled by the user's bundler**: Any `require()` in this file is traced by webpack/turbopack at `next build` time. You cannot require internal modules with relative paths because they won't be resolvable from the user's project. Instead, export new helpers from `entry-base.ts` (which is part of the pre-compiled runtime bundle where relative requires work) and access them via `entryBase.*` in the template.
- **Template helpers should stay out of `RenderResult`**: If `app-page.ts` needs a Node-stream-only utility, prefer a small dedicated helper module in `server/stream-utils/` (with DCE-safe `if/else` + `require()`), rather than adding a template-specific static on `RenderResult`.
- **User-bundle regression guardrails**: For regressions where user `next build` starts bundling internal Node-only helpers unexpectedly, add a `test-start-webpack` assertion that reads the route trace (`.next/server/.../page.js.nft.json`) and traced server chunks, and fails on forbidden internals (e.g. `next/dist/server/stream-utils/node-stream-helpers.js`, `node:stream/promises`). This validates user-project bundling (not publish-time runtime bundling).
- **Reproducing CI failures locally**: Always match the exact CI env vars (check `pr-status` output for "Job Environment Variables"). Key differences: `IS_WEBPACK_TEST=1` forces webpack (turbopack is default), `NEXT_SKIP_ISOLATE=1` skips packing next.js (hides module resolution failures). Always run without `NEXT_SKIP_ISOLATE` when verifying module resolution fixes.
- **Showing full stack traces**: Set `__NEXT_SHOW_IGNORE_LISTED=true` to disable the ignore-list filtering in dev server error output. By default, Next.js collapses internal frames to `at ignore-listed frames`, which hides useful context when debugging framework internals. Defined in `packages/next/src/server/patch-error-inspect.ts`.

### Rust/Cargo

- cargo fmt uses ASCII order (uppercase before lowercase) - just run `cargo fmt`
- **Internal compiler error (ICE)?** Delete incremental compilation artifacts and retry. Remove `*/incremental` directories from your cargo target directory (default `target/`, or check `CARGO_TARGET_DIR` env var)

### Node.js Source Maps

- `findSourceMap()` needs `--enable-source-maps` flag or returns undefined
- Source map paths vary (webpack: `./src/`, tsc: `src/`) - try multiple formats
- `process.cwd()` in stack trace formatting produces different paths in tests vs production

### Pre-compiled Runtime Bundles

Server rendering code (`app-render.tsx`, route modules) is NOT bundled during the user's `next build`. It runs from pre-compiled runtime bundles at `dist/compiled/next-server/app-page*.runtime.*.js`.

- **Built by**: `next-runtime.webpack-config.js` (rspack) via `taskfile.js` bundle tasks
- **Selected at runtime by**: `src/server/route-modules/app-page/module.compiled.js` based on `process.env` vars
- **Variants**: `{turbo/webpack} × {experimental/stable/nodestreams/experimental-nodestreams} × {dev/prod}` = up to 16 bundles per route type
- **Key implication**: `process.env.X` checks in `app-render.tsx` are either replaced by DefinePlugin at runtime-bundle-build time, or read as actual env vars at server startup. They are NOT affected by the user's webpack/Turbopack defines from `define-env.ts`.
- **Adding a new feature flag**: Either leave it as a runtime env var (both code paths in bundle), or create new bundle variants (separate DefinePlugin value per variant, new taskfile tasks, updated `module.compiled.js` selector)
- **Gotcha**: DefinePlugin entries in `next-runtime.webpack-config.js` must be scoped to the correct `bundleType` (e.g. `app` only, not `server`) to avoid replacing assignment targets in `next-server.ts`
- **react-server layer**: Only `entry-base.ts` is compiled in rspack's `(react-server)` layer. ALL imports from `react-server-dom-webpack/*` (Flight server/static APIs) must go through `entry-base.ts`. Other files like `stream-ops.node.ts` or `app-render.tsx` must access Flight APIs via the `ComponentMod` parameter (which is the `entry-base.ts` module exposed through the `app-page.ts` build template). Direct imports from `react-server-dom-webpack/server.node` or `react-server-dom-webpack/static` in files outside `entry-base.ts` will fail at runtime with "The react-server condition must be enabled". Dev mode may mask this error, but production workers fail immediately.
- **Compile-time switcher pattern**: Platform-specific code (node vs web) can use a single `.ts` switcher module that conditionally `require()`s either `.node.ts` or `.web.ts` into a typed variable, then re-exports the shared runtime API as named exports. Keep the branch as `if/else` so DefinePlugin can dead-code-eliminate the unused `require()`. Keep shared types canonical in `.node.ts`, with `.web.ts` importing them via `import type` and the switcher re-exporting types as needed. Examples: `stream-ops.ts` and `debug-channel-server.ts` (gated on `__NEXT_USE_NODE_STREAMS`/`NEXT_RUNTIME`).
- **Edge runtime is different**: Edge routes do NOT use pre-compiled runtime bundles. They are compiled by the user's webpack/Turbopack, so `define-env.ts` controls DCE. Feature flags that gate `node:*` imports must be forced to `false` for edge builds in `define-env.ts` (`isEdgeServer ? false : flagValue`), otherwise webpack will try to resolve `node:stream` etc. and fail.
- **Webpack DCE for `require()` calls**: Webpack only DCEs a `require()` when it sits inside the dead branch of an `if/else` whose condition DefinePlugin can evaluate at compile time. An early-return or `throw` before the `require()` does NOT work: webpack doesn't do control-flow analysis for throws/returns, so the `require()` is still traced. The correct pattern is `if (dead) { ... } else { require('node:stream') }`. Bare `if (live) { require(...) }` without else works for inline `node:*` specifiers but NOT for `require('./some-module')` that pulls a new file into the module graph. Always test edge changes with `pnpm test-start-webpack` on `test/e2e/app-dir/app/standalone.test.ts` (has edge routes), not with `NEXT_SKIP_ISOLATE=1` which skips the full webpack compilation.
- **`NEXT_RUNTIME` is not a feature flag for user server bundles**: In user-project webpack server compilers, `process.env.NEXT_RUNTIME` is inlined to `'nodejs'`. Guarding Node-only `require('node:*')` paths with `NEXT_RUNTIME === 'nodejs'` does not prune anything. For feature-gated codepaths (e.g. node streams), guard on the real feature define such as `process.env.__NEXT_USE_NODE_STREAMS`.
- **Bundle tracing workflow**: To prove what user bundling includes, emit webpack stats (`stats.toJson`) from the app's `next.config.js` with `modules/chunks/reasons`, then diff `webpack-stats-server.json` between modes. This gives concrete inclusion reasons (e.g. which module required `node:stream/promises`) and is more reliable than analyzer HTML alone.
- **TypeScript + DCE interaction**: Use `if/else` (not two independent `if` blocks) when assigning a variable conditionally on `process.env.X`. TypeScript cannot prove exhaustiveness across `if (flag) { x = a }; if (!flag) { x = b }` and will error with "variable used before being assigned". The `if/else` pattern satisfies both TypeScript (definite assignment) and webpack DCE (DefinePlugin replaces the condition, making one branch dead code).

### Stale Native Binary

If Turbopack produces unexpected errors after switching branches or pulling, check if `packages/next-swc/native/*.node` is stale. Delete it and run `pnpm install` to get the npm-published binary instead of a locally-built one.

### Vendored React Packages & Types

React is NOT resolved from `node_modules` for **App Router**. It's vendored into `packages/next/src/compiled/` during `pnpm build` (task: `copy_vendor_react()` in `taskfile.js`). Pages Router resolves React from `node_modules` normally.

- **Type declarations**: `packages/next/types/$$compiled.internal.d.ts` contains `declare module` blocks for vendored React packages. When adding new APIs (e.g. `renderToPipeableStream`, `prerenderToNodeStream`), you must add type declarations here. The bare specifier types (e.g. `declare module 'react-server-dom-webpack/server'`) are what source code in `src/` imports against.
- **Two channels**: stable (`compiled/react/`) and experimental (`compiled/react-experimental/`). The runtime bundle webpack config (`next-runtime.webpack-config.js`) aliases to the correct channel via `makeAppAliases({ experimental })`.
- **Turbopack remap**: `react-server-dom-webpack/*` is silently remapped to `react-server-dom-turbopack/*` by Turbopack's import map. Code says "webpack" everywhere but Turbopack gets its own bindings.
- **Adding Node.js-only React APIs** (e.g. `renderToPipeableStream`): These exist in `.node` builds but not in the type definitions. Add type declarations to `$$compiled.internal.d.ts`. **Important**: `require('react-server-dom-webpack/...')` only works inside `entry-base.ts` (react-server layer). Export the API from `entry-base.ts` behind a `process.env` guard, then access it via `ComponentMod` in other files. For the `import/no-extraneous-dependencies` eslint rule, use block-level disable/enable (safest for multi-line patterns):

  ```typescript
  // In entry-base.ts (react-server layer) only:
  /* eslint-disable import/no-extraneous-dependencies */
  export let renderToPipeableStream: ... | undefined
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    renderToPipeableStream = (
      require('react-server-dom-webpack/server.node') as typeof import('react-server-dom-webpack/server.node')
    ).renderToPipeableStream
  } else {
    renderToPipeableStream = undefined
  }
  /* eslint-enable import/no-extraneous-dependencies */

  // In other files, access via ComponentMod:
  ComponentMod.renderToPipeableStream!(payload, clientModules, opts)
  ```

  If using `eslint-disable-next-line`, the comment must be on the line immediately before the `require()` call, NOT before the `const` declaration. When the `const` and `require()` are on different lines, this is error-prone. Prefer block-level disable/enable.

### Documentation Code Blocks

- When adding `highlight={...}` attributes to code blocks, carefully count the actual line numbers within the code block
- Account for empty lines, import statements, and type imports that shift line numbers
- Highlights should point to the actual relevant code, not unrelated lines like `return (` or framework boilerplate
- Double-check highlights by counting lines from 1 within each code block
