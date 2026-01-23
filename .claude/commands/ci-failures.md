# Check CI Failures

Analyze failing tests from PR CI runs.

## Usage

```
/ci-failures
```

Automatically detects PR from current branch.

## Instructions

1. Run the script to fetch CI failure data:

   ```bash
   node scripts/ci-failures.js
   ```

   This fetches workflow runs, failed jobs, and logs, then generates markdown files.

2. Read the generated index file for a summary:

   ```bash
   # Read scripts/ci-failures/index.md
   ```

   The index shows all failed jobs with links to details.

3. Spawn parallel haiku subagents to analyze the failing jobs (limit to 3-4 to avoid rate limits)
   - **Agent prompt template** (copy-paste for each agent):

   ```
   Analyze CI results for these jobs: scripts/ci-failures/job-{id1}.md scripts/ci-failures/job-{id2}.md
   For each failing test, extract:
   1. TEST FILE: (full path, e.g., test/production/required-server-files-ssr-404/test/index.test.ts)
   2. TEST NAME: (the specific test case name)1
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

4. **Deduplicate by test file** before summarizing:
   - Group all failures by TEST FILE path, not by CI job name
   - If multiple jobs fail the same test file, count them but report once
   - Identify systemic issues (same test failing across many jobs)

5. Analyze failures and create a summary **grouped by test file**:

   | Test File                                           | Type.          | Issue (Expected vs Received)        | Jobs | Priority |
   | --------------------------------------------------- | -------------- | ----------------------------------- | ---- | -------- |
   | `test/production/required-server-files-ssr-404/...` | Turbopack prod | `"second"` vs `"[slug]"` (routing)  | 3    | HIGH     |
   | `test/integration/server-side-dev-errors/...`       | webpack dev    | source map paths wrong              | 5    | HIGH     |
   | `test/e2e/app-dir/disable-logging-route/...`        | prod           | "Compiling" appearing when disabled | 2    | MEDIUM   |
   | N/A                                                 | rust check     | Formatting incorrect                | 2    | MEDIUM   |

6. Recommend fixes:
   - **HIGH priority**: Show specific expected vs actual values, include test file path
   - **MEDIUM priority**: Identify root cause pattern
   - **LOW priority**: Mark as likely flaky/transient

- Do not try to fix these failures.
- If failures would require complex analysis and there are multiple problems, only do some basic analysis and point out that further investigation is needed and could be performant when requested.

## Failure Categories

- **Infrastructure/Transient**: Network errors, 503s, timeouts unrelated to code
- **Assertion Failures**: Wrong output, path mismatches, snapshot differences
- **Build Failures**: Compilation errors, missing dependencies
- **Timeout**: Tests hanging, usually indicates async issues or missing server responses
- **Port Binding**: EADDRINUSE errors, parallel test conflicts
- **Routing/SSR**: Dynamic params not resolved, wrong status codes, JSON parse errors
- **Source Maps**: `webpack-internal://` paths, wrong line numbers, missing code frames
- **CLI Output**: Missing warnings, wrong log order, "Ready" printed before errors
