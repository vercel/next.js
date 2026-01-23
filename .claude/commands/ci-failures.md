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

3. For each failed job, read the relevant files:
   - `scripts/ci-failures/job-{id}.md` - Job summary with test results and groups table
   - `scripts/ci-failures/job-{id}-full-log.txt` - Full raw log
   - `scripts/ci-failures/job-{id}-test-*.md` - Individual failing test outputs
   - `scripts/ci-failures/job-{id}-group-*.md` - Log group outputs

4. Analyze failures and create a summary **grouped by test file**:

   | Test File                                           | Issue (Expected vs Received)        | Jobs | Priority |
   | --------------------------------------------------- | ----------------------------------- | ---- | -------- |
   | `test/production/required-server-files-ssr-404/...` | `"second"` vs `"[slug]"` (routing)  | 3    | HIGH     |
   | `test/integration/server-side-dev-errors/...`       | source map paths wrong              | 5    | HIGH     |
   | `test/e2e/app-dir/disable-logging-route/...`        | "Compiling" appearing when disabled | 2    | MEDIUM   |

5. Recommend fixes:
   - **HIGH priority**: Show specific expected vs actual values, include test file path
   - **MEDIUM priority**: Identify root cause pattern
   - **LOW priority**: Mark as likely flaky/transient

## Failure Categories

- **Infrastructure/Transient**: Network errors, 503s, timeouts unrelated to code
- **Assertion Failures**: Wrong output, path mismatches, snapshot differences
- **Build Failures**: Compilation errors, missing dependencies
- **Timeout**: Tests hanging, usually indicates async issues or missing server responses
- **Port Binding**: EADDRINUSE errors, parallel test conflicts
- **Routing/SSR**: Dynamic params not resolved, wrong status codes, JSON parse errors
- **Source Maps**: `webpack-internal://` paths, wrong line numbers, missing code frames
- **CLI Output**: Missing warnings, wrong log order, "Ready" printed before errors
