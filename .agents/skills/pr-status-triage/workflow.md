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

## Resolving Review Threads

After addressing a review comment (e.g., making the requested code change):

1. Reply to the thread describing what action was taken:
   ```bash
   node scripts/pr-status.js reply-thread <threadNodeId> "Done -- <description of changes>"
   ```
2. Then resolve the thread:
   ```bash
   node scripts/pr-status.js resolve-thread <threadNodeId>
   ```

The ready-to-use commands with the correct thread IDs are at the bottom of each `thread-N.md` file in `scripts/pr-status/`.

**Important:** Always reply with a description of the actions taken before resolving. This gives the reviewer context about what changed.

## Automated Workflow (with `--wait`)

Use this when the user invokes the `$pr-status-triage` skill for a full analysis pass.

### Step 1 — Start the background script

Run the script with `--wait` in the background:

```bash
node scripts/pr-status.js [PR_NUMBER] --wait
```

Use `run_in_background` with `timeout` 60000 (1 minute). The script writes a partial report immediately, then blocks on `gh run watch` until CI completes, and finally re-runs the full analysis. Record the background task ID for step 10.

### Step 2 — Poll for the initial report

Poll with `TaskOutput` (`block=true`, timeout 20000). Check for `Output written to` in output — this means the initial (partial) report is ready. Re-poll if not yet ready. Then read:

```bash
# Read scripts/pr-status/index.md
```

The index lists failing jobs, PR reviews, and inline review comments with links to detail files. Some jobs may be missing if CI is still in progress.

### Step 3 — Spawn subagents to analyze CI failures

Spawn parallel haiku subagents (limit 3–4 to avoid rate limits). Use this template for each:

```
Analyze CI results for these jobs: scripts/pr-status/job-{id1}.md scripts/pr-status/job-{id2}.md
For each failing test, extract:
1. TEST FILE: (full path, e.g., test/production/required-server-files-ssr-404/test/index.test.ts)
2. TEST NAME: (the specific test case name)
3. JOB TYPE: (the kind of the job, e.g. turbopack production, webpack dev, rust check)
4. EXPECTED: (exact expected value from assertion)
5. RECEIVED: (exact received value from assertion)
6. CATEGORY: (assertion|timeout|routing|source-map|build|cli-output)
7. ROOT CAUSE: (one sentence hypothesis)
8. LOG FILE: (analysed log file that led to conclusion)
Return structured findings grouped by TEST FILE, not by job.

Also extract other failures that are not related to tests.
Identify if they are likely transient.
```

### Step 4 — Spawn subagents to analyze review comments

If review threads exist, spawn parallel haiku subagents:

```
Analyze PR review comments from these files: scripts/pr-status/thread-{i}.md scripts/pr-status/review-{id}.md
For each review thread/comment, extract:
1. FILE: (the file path being reviewed)
2. REVIEWER: (who left the comment)
3. STATUS: (Open/Resolved for threads, APPROVED/CHANGES_REQUESTED/COMMENTED for reviews)
4. TYPE: (code-style|bug|design|question|suggestion|nitpick|blocker)
5. SUMMARY: (one sentence summary of the feedback)
6. ACTION REQUIRED: (yes/no - does this require changes?)
7. PRIORITY: (high if CHANGES_REQUESTED or blocker, medium if open suggestion, low if resolved or nitpick)
Return findings grouped by file path.
```

### Step 5 — Deduplicate by test file

Before summarizing:

- Group all failures by TEST FILE path, not by CI job name.
- If multiple jobs fail the same test file, count them but report once.
- Identify systemic issues (same test failing across many jobs).

### Step 6 — Present summary tables

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

### Step 7 — Recommend fixes with priority

- **HIGH**: Show specific expected vs actual values, include test file path, address blocker review comments.
- **MEDIUM**: Identify root cause pattern, address open suggestions.
- **LOW**: Mark as likely flaky/transient; note resolved/nitpick comments.

### Step 8 — Local repro env vars

When proposing local repro commands, always include the exact env vars from the CI job ("Job Environment Variables" section of `index.md`):

- `IS_WEBPACK_TEST=1` forces webpack (turbopack is default locally).
- `NEXT_SKIP_ISOLATE=1` skips packing — **never use this** when verifying module resolution or build-time compilation fixes.
- Feature flags like `__NEXT_USE_NODE_STREAMS=true`, `__NEXT_CACHE_COMPONENTS=true` change DefinePlugin replacements.
- Example: a failure in "test node streams prod" needs `IS_WEBPACK_TEST=1 __NEXT_USE_NODE_STREAMS=true __NEXT_CACHE_COMPONENTS=true NEXT_TEST_MODE=start`.

### Step 9 — Check flaky tests

The script automatically checks the last 3 main branch CI runs. Check the **"Known Flaky Tests"** section in `index.md` and `flaky-tests.json`. Tests listed there also fail on main — mark them as **FLAKY (pre-existing)** in the summary table. Use this as context, not automatic dismissal.

Use `--skip-flaky-check` to skip this step if it's too slow.

### Step 10 — Poll for final report

After presenting the partial analysis, poll the background task from step 1 (`TaskOutput`, `block=true`, timeout 300000). If the script completes:

- Re-read `scripts/pr-status/index.md` for the final report.
- Compare with the partial report: identify newly failed jobs.
- Spawn haiku subagents to analyze new failures (same template as step 3).
- Present an updated summary incorporating all final results.
- If no new failures: confirm the partial results were complete.

If `TaskOutput` times out, CI is still running. Poll again (same timeout). Inform the user that CI is still in progress and they can re-run the skill later for final results.

## Caution Rules

- Do not fix failures or address review comments without user confirmation.
- If there are multiple complex problems, do basic analysis only and flag that deeper investigation can be done when requested.

## Failure Categories

- **Infrastructure/Transient**: Network errors, 503s, timeouts unrelated to code
- **Assertion Failures**: Wrong output, path mismatches, snapshot differences
- **Build Failures**: Compilation errors, missing dependencies
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
