# Flaky Test Reporting Improvement Plan

> Persisted plan for improving the failing tests PR comment system.
> Reference: PR #87945 discussion

## Goals

1. **Improve visuals** - Make the comment scannable at a glance
2. **Improve DX** - Easy retrigger, local reproduction commands
3. **Flag flaky tests** - Use Datadog historical data to identify known flaky tests
4. **Staleness indicator** - Show when results are pending/outdated
5. **Clear commit association** - Make it obvious which commit was tested

---

## Current State

The `next-integration-stat` action (`.github/actions/next-integration-stat/src/index.ts`):
- Parses job logs for test failures
- Posts PR comment with failing tests
- Links each test to Datadog
- Collects `flakyMonitorJobResults` but doesn't use it

**Comment behavior:**
- **Deletes and recreates** - Does NOT patch existing comments
- Finds comments by marker: `<!-- __marker__ next.js integration stats __marker__ -->`
- Can create multiple comments if content > 60k chars
- No indication of staleness or pending runs

**Current comment format:**
```markdown
## Failing test suites
Commit: <sha> | [About building and testing]

`pnpm test path/to/test.js` ([job](link))
- test name ([DD](link))
- test name ([DD](link))

<details>
<summary>Expand output</summary>
... error output ...
</details>
```

---

## Proposed Changes

### 1. Smart Categorization

Parse test path and job name to categorize:

```typescript
function categorizeTest(testPath: string, jobName: string) {
  // Test type from path
  const type = testPath.startsWith('test/unit') ? 'unit'
    : testPath.startsWith('test/e2e') ? 'e2e'
    : testPath.startsWith('test/integration') ? 'integration'
    : testPath.startsWith('test/development') ? 'development'
    : testPath.startsWith('test/production') ? 'production'
    : testPath.startsWith('packages/') ? 'packages'
    : 'other';

  // Platform from job name
  const platform = jobName.toLowerCase().includes('windows') ? 'windows' : 'linux';

  // Bundler from job name
  const bundler = jobName.toLowerCase().includes('turbopack') ? 'turbopack'
    : jobName.toLowerCase().includes('rspack') ? 'rspack'
    : 'webpack';

  return { type, platform, bundler };
}
```

### 2. Datadog Flaky Test Integration

Query Datadog CI Visibility API to get flake rates:

```typescript
async function getDatadogFlakyTestData(testNames: string[]): Promise<Map<string, FlakyData>> {
  // Use DD_API_KEY and DD_APPLICATION_KEY (need to add app key to secrets)
  // Query: GET /api/v2/ci/tests/events or POST /api/v2/ci/tests/events/search
  // Filter by: @git.repository.id, @test.name, last 30 days
  // Look for: is_flaky, is_known_flaky tags, or calculate failure rate

  // Returns: { testName: { isKnownFlaky: boolean, failureRate: number, recentRuns: number } }
}
```

**Datadog tags available:**
- `is_flaky` - test passes and fails across multiple runs for same commit
- `is_new_flaky` - first time exhibiting flaky behavior
- `is_known_flaky` - previously identified as flaky

**API Docs:** https://docs.datadoghq.com/api/latest/ci-visibility-tests/

### 3. Staleness Indicator & Commit Association

**Problem:** When a new commit is pushed, the old test results comment becomes stale but there's no indication until the new run completes.

**Solution:** Two-phase comment updates:

1. **On workflow start** (new job at beginning of `build_and_test.yml`):
   - Edit existing comment to add staleness banner
   - Show which commit is now being tested

2. **On workflow complete** (existing behavior):
   - Replace comment with new results

**Staleness banner:**
```markdown
> ⏳ **Results outdated** — Tests are running for commit `abc1234`
> These results are from commit `def5678` (2 commits behind)
```

**Implementation options:**

Option A: Separate workflow job that runs first
```yaml
mark-tests-pending:
  runs-on: ubuntu-latest
  steps:
    - name: Mark existing comment as stale
      uses: actions/github-script@v7
      with:
        script: |
          // Find existing comment, prepend staleness banner
```

Option B: GitHub Check Run (shows in PR checks section)
- More visible but separate from comment

Option C: Commit status badge in comment header
```markdown
## Failing test suites

| Commit | Status | Run |
|--------|--------|-----|
| `5b678ef` | ✅ Complete | [#123](link) |
| `abc1234` | ⏳ Running... | [#124](link) |
```

**Recommended:** Option A + enhanced header showing commit clearly

### 4. New Comment Format

```markdown
## Failing test suites

<!-- Prominent commit info -->
| | |
|---|---|
| **Tested Commit** | [`5b678ef`](https://github.com/vercel/next.js/commit/5b678ef) — "fix: use --webpack flag instead of..." |
| **Workflow Run** | [#20605653549](https://github.com/vercel/next.js/actions/runs/123) · Attempt 1/3 |
| **Status** | ✅ Complete |

[Re-run failed jobs →](https://github.com/vercel/next.js/actions/runs/123)

---

| Summary | |
|---------|---|
| Total Failures | 31 |
| Known Flaky | 28 (can likely ignore) |
| Needs Investigation | 3 |
| Passed on Retry | 5 (likely flaky) |
| Slow Tests | 2 (significant regression) |

> ⚠️ **Cross-PR Alert:** 12 of these failures also occur on [#87940](link), [#87938](link), [#87922](link)
> This may indicate an infrastructure issue rather than a problem with your changes.

---

### Needs Investigation

<details open>
<summary><code>packages</code> · <code>unit</code> · <code>windows</code> — 3 tests</summary>

**Job:** test unit windows (20) ([logs](link))

#### `packages/next-codemod/transforms/__tests__/add-missing-react-import.test.js`

```bash
pnpm test packages/next-codemod/transforms/__tests__/add-missing-react-import.test.js
```

| Test | Retries | Duration | Status | Links |
|------|---------|----------|--------|-------|
| `next-async-request-api > async-api-01` | 3/3 ❌ | 12s | New Failure | [DD](link) [src](link) |
| `next-async-request-api > async-api-02` | 3/3 ❌ | 45s ⚠️ +200% | New Failure | [DD](link) [src](link) |

<details>
<summary>Error output</summary>

```
expect(received).toEqual(expected) // deep equality
...
```

</details>
</details>

---

### Known Flaky (can likely ignore)

<details>
<summary><code>e2e</code> · <code>turbopack</code> · <code>linux</code> — 28 tests (avg 45% flake rate)</summary>

**Job:** test turbopack dev (3/7) ([logs](link))

| Test | Flake Rate | Links |
|------|-----------|-------|
| `app-dir > should render` | 52% | [DD](link) |
| `app-dir > should navigate` | 41% | [DD](link) |
| ... | | |

<details>
<summary>Error output</summary>
...
</details>

</details>

---

### Passed on Retry (likely flaky)

<details>
<summary>5 tests failed initially but passed on retry</summary>

| Test | Result | Duration | Links |
|------|--------|----------|-------|
| `app-dir > should navigate` | 1/3 ❌ → ✅ | 8s | [DD](link) |
| `app-dir > should render` | 2/3 ❌ → ✅ | 12s | [DD](link) |

</details>

---

### Slow Test Regressions

<details>
<summary>2 tests significantly slower than baseline</summary>

| Test | Duration | Baseline (p50) | Delta |
|------|----------|----------------|-------|
| `async-api-02` | 45s | 15s | **+200%** ⚠️ |
| `integration > build` | 120s | 80s | **+50%** |

> ℹ️ Baseline calculated from last 30 days of runs on `canary`

</details>
```

---

## Implementation Steps

### Phase 1: Visual Improvements (no new dependencies)
- [ ] Add summary table at top with clear commit SHA
- [ ] Add categorization by test type/platform/bundler
- [ ] Group tests by category
- [ ] Add re-run link at top
- [ ] Add local reproduction commands
- [ ] Keep error output collapsed per category
- [ ] Make commit association prominent in header

### Phase 2: Staleness Indicator
- [ ] Create early job in `build_and_test.yml` to mark comment stale
- [ ] Edit existing comment (not delete) to prepend staleness banner
- [ ] Show "Tests running for commit X" message
- [ ] Show how many commits behind the current results are
- [ ] Final job still replaces with complete results

### Phase 3: Flaky Test Detection
- [ ] Add `DD_APPLICATION_KEY` to repository secrets
- [ ] Implement `getDatadogFlakyTestData()` function
- [ ] Query Datadog for historical test data (last 30 days)
- [ ] Calculate flake rate per test
- [ ] Split tests into "Needs Investigation" vs "Known Flaky"
- [ ] Add flake rate badge/percentage to each test

### Phase 4: Retry Results
- [ ] Parse retry data from job results (already have `withoutRetries()` logic)
- [ ] Show "passed on retry" vs "failed all attempts" distinction
- [ ] Add retry count badge: "1/3 failed" vs "3/3 failed"
- [ ] Deprioritize "passed on retry" tests (likely flaky)

### Phase 5: Cross-PR Failure Detection
- [ ] Query GitHub API for other open PRs
- [ ] Check if same tests are failing on other PRs (via comments or Datadog)
- [ ] Show "Also failing on #87940, #87938" indicator
- [ ] Flag "likely infrastructure issue" if >3 PRs have same failure

### Phase 6: Slow Test Regression Detection
- [ ] Query Datadog for historical test duration (p50/p95)
- [ ] Compare current duration to baseline
- [ ] Flag tests that are significantly slower (>2x baseline)
- [ ] Show duration + delta: "45s (+300%)"
- [ ] Only flag if confident (enough historical data points)

### Phase 7: Copy Buttons & UX Polish
- [ ] Add copy-friendly code blocks for reproduction commands
- [ ] Use GitHub's ```suggestion or HTML for copy button (limited support)
- [ ] Alternative: format commands for easy triple-click select
- [ ] Add direct links to test source files on GitHub
- [ ] Handle edge cases (all flaky, no data, new tests)
- [ ] Optimize Datadog queries (batch, cache)
- [ ] Add "unknown" category for tests without history

---

## Files to Modify

1. **`.github/actions/next-integration-stat/src/index.ts`**
   - Add categorization logic
   - Add Datadog API integration
   - Rewrite comment generation
   - Change from delete+create to edit when adding staleness banner

2. **`.github/workflows/build_and_test.yml`**
   - Add early job `mark-tests-pending` to mark existing comment as stale
   - Runs before all test jobs, immediately on workflow start

3. **Repository Secrets**
   - `DATA_DOG_API_KEY` - ✅ Already exists (used for uploading JUnit reports)
   - `DD_APPLICATION_KEY` - ❌ Need to add (required for **reading** test history)

   > **Note:** API keys are for writing data. Application keys are needed to **read** data from Datadog.
   > See: https://docs.datadoghq.com/account_management/api-app-keys/

---

## Resources

- [Datadog CI Visibility Tests API](https://docs.datadoghq.com/api/latest/ci-visibility-tests/)
- [Working with Flaky Tests](https://docs.datadoghq.com/continuous_integration/guides/flaky_test_management/)
- [Early Flake Detection](https://docs.datadoghq.com/tests/flaky_test_management/early_flake_detection/)
- [Re-running workflows - GitHub Docs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
