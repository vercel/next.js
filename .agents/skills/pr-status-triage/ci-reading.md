# Reading Next.js CI Directly

Use this when `scripts/pr-status.js` does not answer the question: earlier
canary attempts, a red job whose cause is unclear, or green runs that may hide
flakes.

## Classify the failure

- **`thank you, next`** (`build-and-test`) and **`thank you, build`**
  (`build-and-deploy`) aggregate their `needs:` jobs. When one fails, look at
  the failed or cancelled job underneath.
- **Don't classify a job by its name suffix.** Matrix entries call reusable
  workflows, so `test prod (6/10, 18.3.1) / build` ends in `/ build` even when
  its test step failed. Read the failing step:

  ```bash
  gh api repos/vercel/next.js/actions/jobs/<job-id> \
    --jq '.steps[] | select(.conclusion=="failure") | "\(.number) \(.name)"'
  ```

- **For a cancelled shard, read the log before rerunning.** A stalled test can
  run into the job timeout, but the log can also contain assertion failures.
  Compare `Starting <file> retry N/2` with `<file> finished on retry N/2` to
  find work still running at cancellation. Check-run annotations
  (`gh api repos/vercel/next.js/check-runs/<id>/annotations`) can show the
  timeout.
- **Treat `skipped` as conditional, not broken.** Read the job's `if:` and
  `needs:` before concluding anything. `retry_test.yml`, for example,
  deliberately skips its report job before the third attempt.
- Compare failures by test file. Shards are rebalanced by timing.

## Check base and infrastructure causes

1. **Compare with the base.** PR CI runs on `refs/pull/N/merge`, so a newer
   canary can affect the result. Check canary's check runs and logs at the
   exact base SHA. An error in a file the PR didn't change can still come from
   the PR's callers, dependencies, configuration, or tests, so compare
   signatures and reproduce at the base when it matters. Rebase only after the
   base is fixed.
2. **Recognize common external failures, then still read the log:**
   - `ERR_PNPM_NO_MATURE_MATCHING_VERSION ... minimumReleaseAge`: an install
     selected a version that is newer than `minimumReleaseAge` in
     `pnpm-workspace.yaml`.
   - Many unrelated jobs failing quickly with `curl: (22) ... 504` while
     downloading tools.
   - A `startup_failure` with no jobs.
   - `Wait for preview tarball` timing out. It gates the deploy-test matrix.
3. **`PR Stack CI Gate`** can skip a stacked PR's matrix while predecessor PRs
   are red. The skipped jobs are not passing evidence. Don't apply the bypass
   label without the owner's decision.
4. If every assertion passed but `afterAll` timed out, report it as a teardown
   failure.

## Rerun safely

- Wait until the workflow run completes. GitHub refuses some rerun requests
  while the run is active.
- Rerun only failed jobs: `gh run rerun <run-id> --failed`.
- Rerun up to twice when the failure appears unrelated. Investigate before
  rerunning again.
- A green rerun on the same SHA shows the failure is intermittent; it does not
  prove the change is unrelated. A repeated identical failure is strong
  evidence of a persistent problem, so investigate it instead of rerunning.

## Canary attempts

`.github/workflows/retry_test.yml` (`retry-tests`) handles completed
`build-and-test` and `build-and-deploy` runs on `canary`. When the required job
did not succeed and `run_attempt < 3`, it reruns the failed jobs in the same
run, which increments `run_attempt`.

- A final green run with `run_attempt >= 2` had at least one earlier red
  attempt. Read each attempt with
  `GET /repos/vercel/next.js/actions/runs/<id>/attempts/<n>/jobs`. The plain
  run jobs endpoint and `pr-status.js` describe the latest attempt.
- A 404 for `/attempts/<n>/jobs` means that attempt doesn't exist.
- Reruns create new job IDs, and passing jobs can be copied into the next
  attempt. Use `run_attempt == 1` entries when counting first executions.
- `retry-tests` runs are `workflow_run` runs, so their `head_sha` can differ
  from the run they retried. The log names the target:
  `Using conclusion 'failure' from .../runs/<run-id>/job/<job-id>`.
- A commit can have several workflow runs and check suites. Name the workflow
  (for example `build-and-test`) when reporting a result.
- Re-read `run_attempt` before reporting; it changes while retries run.

## Docs-only runs

`build_and_test.yml`'s `Determine changes` job sets `docs-only`. When it is
true, test jobs are skipped, but the workflow can still succeed.

- Unexpanded names like `test dev` usually indicate a skipped matrix job.
  Expanded names like `test prod (9/10, 18.3.1) / build` indicate it ran.
- Markdown-only changes are not automatically `docs-only`; check the gate.
- A docs-only success is not evidence that a flaky test passed.

## Listing jobs and checks

Large runs have more than 100 jobs, so a single page can look complete.

```bash
gh api "repos/vercel/next.js/actions/runs/<run-id>/attempts/<n>/jobs?per_page=30" --paginate \
  --jq '.jobs[] | select((.conclusion // "running") | test("failure|timed_out|cancelled")) | {name, id, conclusion}'
gh api "repos/vercel/next.js/actions/runs/<run-id>/attempts/<n>/jobs?per_page=1" --jq .total_count
```

- Trust counts only when the unique listed jobs match `total_count`.
- Retry 5xx responses and never count an error body as job data. Smaller pages
  are useful when large pages fail.
- For every attempt of one check:

  ```bash
  gh api -X GET repos/vercel/next.js/commits/<sha>/check-runs \
    -f check_name="<exact job name>" -f filter=all -f per_page=100 --paginate
  ```

## Reading logs

```bash
gh api --allow-escape-sequences repos/vercel/next.js/actions/jobs/<job-id>/logs \
  | sed 's/\x1b\[[0-9;]*m//g' > /tmp/job-<job-id>.log
```

- Recent `gh` versions require `--allow-escape-sequences` for job logs that
  contain ANSI escape sequences. Check the file contents before treating a grep miss as evidence.
- The jobs endpoint can return a completed job's log while other jobs in the
  run are still active.
- Useful markers:
  - `Starting <file> retry N/2`
  - `finished on retry N/2`
  - `failed to pass within 2 retries`
  - ` ●`
  - `FAIL `
- Each failed file prints one large `--test output start-- ... --test output end--`
  line. Exclude it before printing matches:
  `grep -v -- '--test output start--'`.
- `run-tests.js` retries each test file twice in a job. Search green logs for
  `finished on retry` and `failed to pass within` when looking for flakes.
- A `next dev exited ... signal 139` line is a real dev-server failure, even if
  a later retry passes.

## Flake detection

`Test new and changed tests for flakes (dev|prod)` runs added or changed test
files three times concurrently with `--retries 0`
(`scripts/test-new-tests.mjs --flake-detection`). Existing tests in those
files run too. For local test setup and repeat commands, see
`contributing/core/testing.md`.

## Reporting

- Name the run, attempt, commit SHA, workflow, job, step, and test file.
- Separate observed facts from inferences.
- Report raw counts and the scanned window, not rates or "never" from a small
  sample.

## `pr-status.js` output

- `scripts/pr-status.js` writes generated files to `scripts/pr-status/results/`
  and `scripts/pr-status/intermediate/`. They are gitignored, but root Prettier
  can still check them. Remove them before `pnpm prettier-check` or `pnpm lint`.
- It has no `--help` mode. Read the argument parsing before passing an unknown
  option.
