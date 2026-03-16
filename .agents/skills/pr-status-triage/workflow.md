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

## Subagent Prompt: CI Failures

```
Analyze CI results for these jobs: scripts/pr-status/job-{id1}.md scripts/pr-status/job-{id2}.md
For each failing test, extract:
1. TEST FILE: (full path)
2. TEST NAME: (the specific test case name)
3. JOB TYPE: (e.g. turbopack production, webpack dev, rust check)
4. EXPECTED: (exact expected value from assertion)
5. RECEIVED: (exact received value from assertion)
6. CATEGORY: (assertion|timeout|routing|source-map|build|cli-output)
7. ROOT CAUSE: (one sentence hypothesis)
8. LOG FILE: (analysed log file that led to conclusion)
Return structured findings grouped by TEST FILE, not by job.
Also extract non-test failures and identify if they are likely transient.
```

## Subagent Prompt: Review Comments

```
Analyze PR review comments from these files: scripts/pr-status/thread-{i}.md scripts/pr-status/review-{id}.md
For each review thread/comment, extract:
1. FILE: (the file path being reviewed)
2. REVIEWER: (who left the comment)
3. STATUS: (Open/Resolved for threads, APPROVED/CHANGES_REQUESTED/COMMENTED for reviews)
4. TYPE: (code-style|bug|design|question|suggestion|nitpick|blocker)
5. SUMMARY: (one sentence summary of the feedback)
6. ACTION REQUIRED: (yes/no)
7. PRIORITY: (high if CHANGES_REQUESTED or blocker, medium if open suggestion, low if resolved or nitpick)
Return findings grouped by file path.
```

## Summary Table Format

**CI Failures (grouped by test file):**

| Test File                      | Type           | Issue (Expected vs Received)       | Jobs | Priority |
| ------------------------------ | -------------- | ---------------------------------- | ---- | -------- |
| `test/production/.../test.ts`  | Turbopack prod | `"second"` vs `"[slug]"` (routing) | 3    | HIGH     |
| `test/integration/.../test.ts` | webpack dev    | source map paths wrong             | 5    | HIGH     |
| N/A                            | rust check     | Formatting incorrect               | 2    | MEDIUM   |

**Review Feedback (grouped by file):**

| File             | Reviewer | Type       | Summary                | Action Required | Priority |
| ---------------- | -------- | ---------- | ---------------------- | --------------- | -------- |
| `src/server/...` | reviewer | suggestion | Consider async/await   | yes             | MEDIUM   |
| N/A              | reviewer | blocker    | Missing error handling | yes             | HIGH     |

## Failure Categories

- **Infrastructure/Transient**: Network errors, 503s, timeouts unrelated to code
- **Assertion**: Wrong output, path mismatches, snapshot differences
- **Build**: Compilation errors, missing dependencies
- **Timeout**: Tests hanging — usually indicates async issues or missing server responses
- **Port Binding**: EADDRINUSE errors, parallel test conflicts
- **Routing/SSR**: Dynamic params not resolved, wrong status codes, JSON parse errors
- **Source Maps**: `webpack-internal://` paths, wrong line numbers, missing code frames
- **CLI Output**: Missing warnings, wrong log order, "Ready" printed before errors

## Review Comment Categories

- **code-style**: Formatting, naming conventions, code organization
- **bug**: Potential bugs or logic errors
- **design**: Architectural or design concerns
- **question**: Questions about implementation or intent
- **suggestion**: Non-blocking improvements
- **nitpick**: Minor issues that don't require changes
- **blocker**: Must be addressed before merge

## Resolving Review Threads

After addressing a review comment:

1. Reply to the thread describing what action was taken:
   ```bash
   node scripts/pr-status.js reply-thread <threadNodeId> "Done -- <description of changes>"
   ```
2. Then resolve the thread:
   ```bash
   node scripts/pr-status.js resolve-thread <threadNodeId>
   ```

The ready-to-use commands with the correct thread IDs are at the bottom of each `thread-N.md` file in `scripts/pr-status/`.
