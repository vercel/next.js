# Next.js Development Guide

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

For iterative development, use watch mode + fast test execution:

**1. Start watch build in background:**

```bash
# Runs taskr in watch mode - auto-rebuilds on file changes
# Use Bash(run_in_background=true) to keep working while it runs
pnpm --filter=next dev
```

**2. Run tests fast (no isolation, no packing):**

```bash
# NEXT_SKIP_ISOLATE=1 - skip packing Next.js for each test (much faster)
# testonly - runs with --runInBand (no worker isolation overhead)
NEXT_SKIP_ISOLATE=1 NEXT_TEST_MODE=dev pnpm testonly test/path/to/test.ts
```

**3. When done, kill the background watch process.**

Only use full `pnpm --filter=next build` for one-off builds (after branch switch, before CI push).

**Always rebuild after switching branches:**

```bash
git checkout <branch>
pnpm build   # Required before running tests (Turborepo dedupes if unchanged)
```

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

## Commit and PR Style

- Do NOT add "Generated with Claude Code" or co-author footers to commits or PRs
- Keep commit messages concise and descriptive
- PR descriptions should focus on what changed and why
- Do NOT mark PRs as "ready for review" (`gh pr ready`) - leave PRs in draft mode and let the user decide when to mark them ready

## Rebuilding Before Running Tests

When running Next.js integration tests, you must rebuild if source files have changed:

- **Edited Next.js code?** → `pnpm build`
- **Edited Turbopack (Rust)?** → `pnpm swc-build-native`
- **Edited both?** → `pnpm turbo build build-native`

## Development Anti-Patterns

### Test Gotchas

- Mode-specific tests need `skipStart: true` + manual `next.start()` in `beforeAll` after mode check
- Don't rely on exact log messages - filter by content patterns, find sequences not positions

### Rust/Cargo

- cargo fmt uses ASCII order (uppercase before lowercase) - just run `cargo fmt`
- **Internal compiler error (ICE)?** Delete incremental compilation artifacts and retry. Remove `*/incremental` directories from your cargo target directory (default `target/`, or check `CARGO_TARGET_DIR` env var)

### Node.js Source Maps

- `findSourceMap()` needs `--enable-source-maps` flag or returns undefined
- Source map paths vary (webpack: `./src/`, tsc: `src/`) - try multiple formats
- `process.cwd()` in stack trace formatting produces different paths in tests vs production

### Documentation Code Blocks

- When adding `highlight={...}` attributes to code blocks, carefully count the actual line numbers within the code block
- Account for empty lines, import statements, and type imports that shift line numbers
- Highlights should point to the actual relevant code, not unrelated lines like `return (` or framework boilerplate
- Double-check highlights by counting lines from 1 within each code block
