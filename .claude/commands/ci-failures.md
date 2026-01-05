# Check CI Failures

Analyze failing tests from PR CI runs with parallel subagent log analysis.

## Usage

```
/ci-failures [pr-number]
```

If no PR number provided, detect from current branch.

## Instructions

1. Get the PR number from argument or current branch:

   ```bash
   gh pr view --json number,headRefName --jq '"\(.number) \(.headRefName)"'
   ```

2. **CRITICAL: Always fetch fresh run IDs** - never trust cached IDs from conversation summaries:

   ```bash
   gh api "repos/vercel/next.js/actions/runs?branch={branch}&per_page=10" \
     --jq '.workflow_runs[] | select(.name == "build-and-test") | "\(.id) attempts:\(.run_attempt) status:\(.status) conclusion:\(.conclusion)"'
   ```

3. **Prioritize the MOST RECENT run, even if in-progress:**
   - If the latest run is `in_progress` or `queued`, check it FIRST - it has the most relevant failures
   - Individual jobs complete before the overall run - analyze them as they finish
   - Only fall back to older completed runs if the current run has no completed jobs yet

4. Get all failed jobs from the run (works for in-progress runs too):

   ```bash
   gh api "repos/vercel/next.js/actions/runs/{run_id}/jobs?per_page=100" \
     --jq '.jobs[] | select(.conclusion == "failure") | "\(.id) \(.name)"'
   ```

   **Note:** For runs with >100 jobs, paginate:

   ```bash
   gh api "repos/vercel/next.js/actions/runs/{run_id}/jobs?per_page=100&page=2"
   ```

5. Spawn parallel haiku subagents to analyze logs (limit to 3-4 to avoid rate limits):
   - **CRITICAL: Use the API endpoint for logs, NOT `gh run view`**
   - `gh run view --job --log` FAILS when run is in-progress
   - **Do NOT group by job name** (e.g., "test dev", "turbopack") - group by failure pattern instead
   - Agent prompt should extract structured data using:
     ```bash
     # Extract assertion failures with context:
     gh api "repos/vercel/next.js/actions/jobs/{job_id}/logs" 2>&1 | \
       grep -B3 -A10 "expect.*\(toBe\|toContain\|toEqual\|toStartWith\|toMatch\)" | head -100
     # Also check for test file paths:
     gh api "repos/vercel/next.js/actions/jobs/{job_id}/logs" 2>&1 | \
       grep -E "^\s+at Object\.|FAIL\s+test/" | head -20
     ```
   - **Agent prompt template** (copy-paste for each agent):
     ```
     Analyze CI logs for these jobs: {job_ids}
     For each failing test, extract:
     1. TEST FILE: (full path, e.g., test/production/required-server-files-ssr-404/test/index.test.ts)
     2. TEST NAME: (the specific test case name)
     3. EXPECTED: (exact expected value from assertion)
     4. RECEIVED: (exact received value from assertion)
     5. CATEGORY: (assertion|timeout|routing|source-map|build|cli-output)
     6. ROOT CAUSE: (one sentence hypothesis)
     Return structured findings grouped by TEST FILE, not by job.
     ```

6. **Deduplicate by test file** before summarizing:
   - Group all failures by TEST FILE path, not by CI job name
   - If multiple jobs fail the same test file, count them but report once
   - Identify systemic issues (same test failing across many jobs)

7. Create summary table **grouped by test file**:
   | Test File | Issue (Expected vs Received) | Jobs | Priority |
   |-----------|------------------------------|------|----------|
   | `test/production/required-server-files-ssr-404/...` | `"second"` vs `"[slug]"` (routing) | 3 | HIGH |
   | `test/integration/server-side-dev-errors/...` | source map paths wrong | 5 | HIGH |
   | `test/e2e/app-dir/disable-logging-route/...` | "Compiling" appearing when disabled | 2 | MEDIUM |

8. Recommend fixes:
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

## Failure Extraction Patterns

Use these grep patterns to identify specific failure types:

```bash
# Assertion failures (most common)
grep -B3 -A10 "expect.*\(toBe\|toContain\|toEqual\|toStartWith\)" | head -100

# Routing issues (dynamic params, status codes)
grep -E "Expected.*Received|\[slug\]|x-matched-path|Expected: [0-9]+" | head -50

# Source map issues
grep -E "webpack-internal://|at .* \(webpack" | head -30

# CLI output issues (missing warnings)
grep -E "Ready in|deprecated|Both middleware|Compiling" | head -30

# Timeout issues
grep -E "TIMEOUT|TimeoutError|exceeded|Exceeded timeout" | head -20

# Test file paths (to identify which test is failing)
grep -E "FAIL test/|at Object\.<anonymous> \(" | head -20
```

## Common Gotchas

### In-Progress Runs

- `gh run view {run_id} --job {job_id} --log` **FAILS** when run is in-progress
- `gh api "repos/.../actions/jobs/{job_id}/logs"` **WORKS** for any completed job
- Always use the API endpoint for reliability

### Pagination

- GitHub API paginates at 100 jobs per page
- Next.js CI has ~120+ jobs - always check page 2:
  ```bash
  gh api ".../jobs?per_page=100&page=1" --jq '[.jobs[] | select(.conclusion == "failure")] | length'
  gh api ".../jobs?per_page=100&page=2" --jq '[.jobs[] | select(.conclusion == "failure")] | length'
  ```

### Multiple Attempts

- CI runs can have multiple attempts (retries)
- Check attempt count: `.run_attempt` field
- Query specific attempt: `.../runs/{id}/attempts/{n}/jobs`
- 404 on attempt endpoint means that attempt doesn't exist

## Quick Reference

```bash
# Get failed jobs (works for in-progress runs)
gh api "repos/vercel/next.js/actions/runs/{run_id}/jobs?per_page=100" \
  --jq '.jobs[] | select(.conclusion == "failure") | "\(.id) \(.name)"'

# Get logs for a specific job (works for in-progress runs)
gh api "repos/vercel/next.js/actions/jobs/{job_id}/logs" 2>&1 | head -500

# Search logs for errors
gh api "repos/vercel/next.js/actions/jobs/{job_id}/logs" 2>&1 | \
  grep -E "FAIL|Error|error:|✕|Expected|Received" | head -50
```
