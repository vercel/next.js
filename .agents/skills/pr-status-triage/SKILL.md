---
name: pr-status-triage
description: >
  Triage CI failures and PR review comments using scripts/pr-status.js.
  Use when investigating failing CI jobs, flaky tests, or PR review feedback.
  Covers blocker-first prioritization (build > lint > types > tests),
  CI env var matching for local reproduction, and the Known Flaky Tests
  distinction.
metadata:
  internal: true
---

# PR Status Triage

Use this skill when the user asks about PR status, CI failures, or review comments in the Next.js monorepo.

## Workflow

Start by fetching data to answer the user's query:

- For a targeted question about specific review comments, run `node scripts/pr-status.js [PR] --comments-only`. This skips all Actions run, job, log, and flaky-test requests.
- For CI status or general triage, run `node scripts/pr-status.js [PR] --wait` in the background (timeout 1 min).

Then:

1. Read `scripts/pr-status/results/index.md`.
2. For a targeted review question, inspect the relevant `thread-{N}.md`, `review-{id}.md`, or `comment-{id}.md` files. For full triage, also analyze each `job-{id}.md` and review file for failures and feedback.
3. Prioritize blocking jobs first: build, lint, types, then test jobs.
4. Treat failures as real until disproven; check the "Known Flaky Tests" section before calling anything flaky.
5. Reproduce test failures locally with the same mode and environment as CI (e.g. dev or start, webpack or turbopack).
6. After addressing review comments, reply to the thread describing what was done, then resolve it. Use `reply-and-resolve-thread` to do both in one step, or use `reply-thread` + `resolve-thread` separately. See `scripts/pr-status/results/thread-N.md` files for ready-to-use commands.
7. When the only remaining failures are known flaky tests and no code changes are needed, retrigger the failing CI jobs with `gh run rerun <run-id> --failed`. Then wait 5 minutes and go back to step 1. Repeat this loop up to 5 times.

## CI Analysis Tips

- Prioritize CI failures over review comments.
- Prioritize blocking jobs first: build, lint, types, then test jobs.
- Common fast checks:
  - `rust check / build` → Run `cargo fmt -- --check`, then `cargo fmt`
  - `lint / build` → Run `pnpm prettier --write <file>` for prettier errors
  - test failures → Run the specific failing test path locally

Run tests in the mode (e.g.):

```bash
# Development mode with Turbopack
pnpm test-dev-turbo test/path/to/test.ts

# Production build and start with Webpack
pnpm test-start-webpack test/path/to/test.ts
```

## Quick Commands

```bash
node scripts/pr-status.js                  # current branch PR
node scripts/pr-status.js <number>         # specific PR
node scripts/pr-status.js [PR] --wait      # background mode, waits for CI to finish
node scripts/pr-status.js [PR] --comments-only  # reviews/comments only; skips CI jobs
node scripts/pr-status.js --skip-flaky-check  # skip flaky test detection
```

Thread interaction:

```bash
node scripts/pr-status.js reply-thread <threadNodeId> "<body>"           # reply to a review thread
node scripts/pr-status.js resolve-thread <threadNodeId>                  # resolve a review thread
node scripts/pr-status.js reply-and-resolve-thread <threadNodeId> "<body>"  # reply and resolve in one step
```

## References

- [workflow.md](./workflow.md) — prioritization, common failure patterns, resolving review threads
- [local-repro.md](./local-repro.md) — mode/env matching and isolation guidance
