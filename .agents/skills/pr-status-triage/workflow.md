# CI Triage Workflow

## Prioritization Order

1. Build failures
2. Lint failures
3. Type failures
4. Test failures
5. Review comments (after CI blockers)

## Failure Handling Rules

- Investigate each failing job as if it is caused by the current changes.
- Do not assume flakiness by default.
- If the job output has a "Known Flaky Tests" section, use it as historical context, not as automatic dismissal.

## Common Patterns

- `rust check / build`:
  - Run `cargo fmt -- --check`
  - Fix with `cargo fmt`
- `lint / build`:
  - Run `pnpm prettier --write <file>`
  - Run the repo lint command if needed
- test failures:
  - Run the exact failing test file locally
  - Match dev vs start mode to the CI job
