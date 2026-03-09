# PR Status

Analyze PR status including CI failures and review comments.

## Usage

```
/pr-status [PR number]
```

- Without argument: Automatically detects PR from current branch
- With PR number: Analyzes the specified PR (e.g., `/pr-status 89049`)

## Instructions

1. Run the script with `--wait` in the background to fetch PR status data and wait for CI completion:

   ```bash
   node scripts/pr-status.js $ARGUMENTS --wait
   ```

   Use the `run_in_background` Bash parameter with a `timeout` of 60000 (1 minute). The script writes a partial report immediately with currently available results, then blocks on `gh run watch` until CI completes, and finally re-runs the full analysis to produce the final report. Remember the background task ID for step 10.

2. Poll the background task output using `TaskOutput` with `block=true` and `timeout` of 20000 (20 seconds). Check if the output contains `Output written to` (this means the initial report is ready). If not yet, poll again. Then read the generated index file:

   ```bash
   # Read scripts/pr-status/index.md
   ```

   The index shows failed jobs, PR reviews, and inline review comments with links to details. If CI is still in progress, some jobs may not have results yet — this is the partial report.

3. Spawn parallel haiku subagents to analyze the failing jobs (limit to 3-4 to avoid rate limits)
   - **Agent prompt template** (copy-paste for each agent):

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

4. Spawn parallel haiku subagents to analyze review comments (if any review threads exist):
   - **Agent prompt template**:

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

5. **Deduplicate by test file** before summarizing:
   - Group all failures by TEST FILE path, not by CI job name
   - If multiple jobs fail the same test file, count them but report once
   - Identify systemic issues (same test failing across many jobs)

6. Analyze failures and review comments, create a summary:

   **CI Failures (grouped by test file):**

   | Test File                                           | Type           | Issue (Expected vs Received)        | Jobs | Priority |
   | --------------------------------------------------- | -------------- | ----------------------------------- | ---- | -------- |
   | `test/production/required-server-files-ssr-404/...` | Turbopack prod | `"second"` vs `"[slug]"` (routing)  | 3    | HIGH     |
   | `test/integration/server-side-dev-errors/...`       | webpack dev    | source map paths wrong              | 5    | HIGH     |
   | `test/e2e/app-dir/disable-logging-route/...`        | prod           | "Compiling" appearing when disabled | 2    | MEDIUM   |
   | N/A                                                 | rust check     | Formatting incorrect                | 2    | MEDIUM   |

   **Review Feedback (grouped by file):**

   | File             | Reviewer | Type       | Summary                    | Action Required | Priority |
   | ---------------- | -------- | ---------- | -------------------------- | --------------- | -------- |
   | `src/server/...` | reviewer | suggestion | Consider using async/await | yes             | MEDIUM   |
   | `test/e2e/...`   | reviewer | nitpick    | Typo in comment            | no              | LOW      |
   | N/A              | reviewer | blocker    | Missing error handling     | yes             | HIGH     |

7. Recommend fixes:
   - **HIGH priority**: Show specific expected vs actual values, include test file path, address blocker review comments
   - **MEDIUM priority**: Identify root cause pattern, address open suggestions
   - **LOW priority**: Mark as likely flaky/transient, note resolved/nitpick comments

8. When proposing local repro commands, **always include the exact env vars from the CI job** (shown in the "Job Environment Variables" section of index.md). Key variables that change behavior:
   - `IS_WEBPACK_TEST=1` forces webpack (turbopack is default locally)
   - `NEXT_SKIP_ISOLATE=1` skips packing next.js into a separate project (hides module resolution failures)
   - Feature flags like `__NEXT_USE_NODE_STREAMS=true`, `__NEXT_CACHE_COMPONENTS=true` change build-time DefinePlugin replacements
   - Example: a failure in "test node streams prod" needs `IS_WEBPACK_TEST=1 __NEXT_USE_NODE_STREAMS=true __NEXT_CACHE_COMPONENTS=true NEXT_TEST_MODE=start`
   - Never use `NEXT_SKIP_ISOLATE=1` when verifying module resolution or build-time compilation fixes

9. The script automatically checks the last 3 main branch CI runs for known flaky tests. Check the **"Known Flaky Tests"** section in index.md and the `flaky-tests.json` file. Tests listed there also fail on main and are likely pre-existing flakes, not caused by the PR. Mark them as **FLAKY (pre-existing)** in your summary table. Use `--skip-flaky-check` to skip this step if it's too slow.

10. After presenting the partial analysis, poll for the background script (from step 1) to complete by calling `TaskOutput` with `block=true` and `timeout` of 300000 (5 minutes). If the script completes:
    - Re-read `scripts/pr-status/index.md` for the final report (CI has now finished)
    - Compare with the partial report: identify any **newly failed** jobs that weren't in the earlier analysis
    - Spawn haiku subagents to analyze the new failures (same template as step 3)
    - Present an updated summary incorporating all final results
    - If no new failures appeared, confirm that the partial results were the complete picture

    If `TaskOutput` times out, the script is still waiting for CI. Poll again with another `TaskOutput` call (same 5-minute timeout) until the script finishes or you decide CI is taking too long. Inform the user that CI is still running and the current report is partial. They can re-run `/pr-status` later for the final results.

- Do not try to fix these failures or address review comments without user confirmation.
- If failures would require complex analysis and there are multiple problems, only do some basic analysis and point out that further investigation is needed and could be performed when requested.

## Failure Categories

- **Infrastructure/Transient**: Network errors, 503s, timeouts unrelated to code
- **Assertion Failures**: Wrong output, path mismatches, snapshot differences
- **Build Failures**: Compilation errors, missing dependencies
- **Timeout**: Tests hanging, usually indicates async issues or missing server responses
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
