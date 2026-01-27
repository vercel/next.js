# PR Status

Analyze PR status including CI failures and review comments.

## Usage

```
/pr-status [PR number]
```

- Without argument: Automatically detects PR from current branch
- With PR number: Analyzes the specified PR (e.g., `/pr-status 89049`)

## Instructions

1. Run the script to fetch PR status data:

   ```bash
   node scripts/pr-status.js $ARGUMENTS
   ```

   This fetches workflow runs, failed jobs, logs, and PR review comments, then generates markdown files.

2. Read the generated index file for a summary:

   ```bash
   # Read scripts/pr-status/index.md
   ```

   The index shows failed jobs, PR reviews, and inline review comments with links to details.

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
