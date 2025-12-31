# Next.js Development Guide

## Git Workflow

**Use Graphite for all git operations** instead of raw git commands:

- `gt create <branch-name> -m "message"` - Create a new branch with commit
- `gt modify -m "message"` - Amend current branch's commit
- `gt sync` - Sync and restack all branches
- `gt submit` - Push and create/update PRs
- `gt log short` - View stack status

## Build Commands

```bash
# Build the Next.js package (dev server only - faster)
pnpm --filter=next build:dev-server

# Build everything
pnpm build

# Run specific task
pnpm --filter=next taskfile <task>
```

## Testing

```bash
# Run specific test file
pnpm jest test/path/to/test.test.ts

# Run tests matching pattern
pnpm jest -t "pattern"

# Run development tests
pnpm testheadless test/development/
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
