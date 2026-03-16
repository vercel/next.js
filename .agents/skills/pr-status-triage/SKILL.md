---
name: pr-status-triage
description: >
  Triage CI failures and PR review comments using scripts/pr-status.js.
  Use when investigating failing CI jobs, flaky tests, or PR review feedback.
  Covers the full automated workflow (background run, parallel subagent analysis,
  deduplication by test file, flaky test detection, final re-analysis after CI
  completes), blocker-first prioritization (build > lint > types > tests),
  CI env var matching for local reproduction, and the Known Flaky Tests
  distinction.
---

# PR Status Triage

Use this skill when the user asks about PR status, CI failures, or review comments in the Next.js monorepo.

## Workflow

1. Run `node scripts/pr-status.js` (or `node scripts/pr-status.js <number>`).
2. Read generated files in `scripts/pr-status/`.
3. Prioritize blocking jobs first: build, lint, types, then test jobs.
4. Treat failures as real until disproven; check the "Known Flaky Tests" section before calling anything flaky.
5. Reproduce locally with the same mode and env vars as CI.
6. After addressing review comments, reply to the thread describing what was done, then resolve it. See `thread-N.md` files for ready-to-use commands.

## Quick Commands

```bash
node scripts/pr-status.js
node scripts/pr-status.js <number>
```

## Detailed References

- [workflow.md](./workflow.md) - prioritization, common failure patterns, and resolving review threads
- [local-repro.md](./local-repro.md) - mode/env matching and isolation guidance

## Automated Workflow (with `--wait`)

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
