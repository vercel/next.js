# Next.js Development Guide

## Git Workflow

**Use Graphite for all git operations** instead of raw git commands:

- `gt create <branch-name> -m "message"` - Create a new branch with commit
- `gt modify -a --no-edit` - Stage all and amend current branch's commit
- `gt checkout <branch>` - Switch branches (use instead of `git checkout`)
- `gt sync` - Sync and restack all branches
- `gt submit --no-edit` - Push and create/update PRs (use `--no-edit` to avoid interactive prompts)
- `gt log short` - View stack status

**Note**: `gt submit` runs in interactive mode by default and won't push in automated contexts. Always use `gt submit --no-edit` or `gt submit -q` when running from Claude.

**Graphite Stack Safety Rules:**

- Graphite force-pushes everything - old commits only recoverable via reflog
- Never have uncommitted changes when switching branches - they get lost during restack
- Never use `git stash` with Graphite - causes conflicts when `gt modify` restacks
- Never use `git checkout HEAD -- <file>` after editing - silently restores unfixed version
- Always use `gt checkout` (not `git checkout`) to switch branches
- `gt modify --no-edit` with unstaged/untracked files stages ALL changes
- `gt sync` pulls FROM remote, doesn't push TO remote
- `gt modify` restacks children locally but doesn't push them
- Always verify with `git status -sb` after stack operations
- When resuming from summarized conversation, never trust cached IDs - re-fetch from git/GitHub API

**Safe multi-branch fix workflow:**

```bash
gt checkout parent-branch
# make edits
gt modify -a --no-edit        # Stage all, amend, restack children
git show HEAD -- <files>      # VERIFY fix is in commit
gt submit --no-edit           # Push immediately

gt checkout child-branch      # Already restacked from gt modify
# make edits
gt modify -a --no-edit
git show HEAD -- <files>      # VERIFY
gt submit --no-edit
```

## Build Commands

```bash
# Build the Next.js package (dev server only - faster)
pnpm --filter=next build:dev-server

# Build everything
pnpm build

# Run specific task
pnpm --filter=next taskfile <task>
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
gt checkout <branch>
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
- `pnpm new-test` - Generate a new test file from template

## Linting and Types

```bash
pnpm lint              # Full lint (types, prettier, eslint, ast-grep)
pnpm lint-fix          # Auto-fix lint issues
pnpm prettier-fix      # Fix formatting only
pnpm types             # TypeScript type checking
```

## Investigating CI Test Failures

**Use `/ci-failures` for automated analysis** - analyzes failing jobs in parallel and groups by test file.

**CI Analysis Tips:**

- Don't spawn too many parallel agents hitting GitHub API (causes rate limits)
- Prioritize blocking jobs first: lint, types, then test jobs
- Use `gh api` for logs (works on in-progress runs), not `gh run view --log`

**Quick triage:**

```bash
# List failed jobs for a PR
gh pr checks <pr-number> | grep fail

# Get failed job names
gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion == "failure") | .name'

# Search job logs for errors (completed runs only - use gh api for in-progress)
gh run view <run-id> --job <job-id> --log 2>&1 | grep -E "FAIL|Error|error:" | head -30
```

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

## Key Directories

- `packages/next/src/` - Main Next.js source code
  - `server/` - Server runtime (dev server, router, rendering)
  - `client/` - Client-side code
  - `build/` - Build tooling (webpack, turbopack configs)
  - `cli/` - CLI entry points
- `packages/next/dist/` - Compiled output
- `turbopack/` - Turbopack bundler (Rust)
- `test/` - Test suites
  - `development/` - Dev server tests
  - `production/` - Production build tests
  - `e2e/` - End-to-end tests

## Development Tips

- The dev server entry point is `packages/next/src/cli/next-dev.ts`
- Router server: `packages/next/src/server/lib/router-server.ts`
- Use `DEBUG=next:*` for debug logging
- Use `NEXT_TELEMETRY_DISABLED=1` when testing locally

## Commit and PR Style

- Do NOT add "Generated with Claude Code" or co-author footers to commits or PRs
- Keep commit messages concise and descriptive
- PR descriptions should focus on what changed and why

## Development Anti-Patterns

### Test Gotchas

- Mode-specific tests need `skipStart: true` + manual `next.start()` in `beforeAll` after mode check
- Don't rely on exact log messages - filter by content patterns, find sequences not positions

### Rust/Cargo

- cargo fmt uses ASCII order (uppercase before lowercase) - just run `cargo fmt`

### Node.js Source Maps

- `findSourceMap()` needs `--enable-source-maps` flag or returns undefined
- Source map paths vary (webpack: `./src/`, tsc: `src/`) - try multiple formats
- `process.cwd()` in stack trace formatting produces different paths in tests vs production
