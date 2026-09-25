# PR Stack CI Gate

The `build_and_test` workflow calls this read-only action for same-repository PRs.
It infers branch-based stacks from open PR head/base branch names; no GitHub
stack API or Graphite integration is required. Fork PRs bypass the checkout and
this action entirely and run full CI immediately.

The first three PRs and every leaf run immediately. An internal PR polls the
closest three predecessors' required checks every five minutes, refreshing
branch topology every twenty minutes while waiting: **any** current-head/current-base
`thank you, next` success releases full CI, while three terminal failures fail
the required gate. Unresolved waits open after five hours (six-hour job timeout).
Transient GitHub 5xx/429 errors retry every five minutes; other errors start
full CI so they cannot accidentally mark the aggregate green.

## Development

```bash
pnpm --dir .github/actions/pr-stack-ci-gate install --frozen-lockfile --ignore-scripts
pnpm --dir .github/actions/pr-stack-ci-gate types
pnpm --dir .github/actions/pr-stack-ci-gate build
pnpm --dir .github/actions/pr-stack-ci-gate test
```

Commit changes to `src/` **and** the generated `dist/index.js` and
`dist/licenses.txt`. Tests use an isolated Jest config with `ts-jest` because the
repository's main Jest config searches only the `test/` and package trees.
Jest 29 and `ts-jest`'s optional Jest peers are pinned together in this nested
workspace; the test script runs that local Jest, not a different root binary.
The action retains TypeScript 6.0.2; `ts-jest` 29.4.5 currently declares a `<6`
peer range, so keep the independent `tsc --noEmit` check and test this pairing
in CI rather than suppressing any failure. A captured shape from #99095's
actual required-check response lives in `fixtures/`. The workflow
sparse-checks out only `action.yml` and `dist/index.js` from `${{ github.sha }}`;
that is the test-merge commit on PR runs. The caller and action job grant only
`checks: read`, `contents: read` and `pull-requests: read`. No secrets are
inherited, and `persist-credentials` is false.

## API budget and correctness

For one steadily waiting middle PR (assuming each PR list fits one page):

| Poll | REST reads | What is checked |
| --- | ---: | --- |
| First and every 20 minutes | **8** | Current PR, successor, three predecessor links, three required checks |
| At 5, 10 and 15 minutes between refreshes | **3** each | Three required checks only; same-SHA reruns are still detected |

That is **8 + 3 + 3 + 3 = 17 reads per 20 minutes, or 51/hour**. The previous
five-minute topology discovery used **8 × 12 = 96/hour**: roughly **47% fewer**
normal pending reads. The `pulls.list` responses supply head/base metadata, so
cached predecessors need no extra PR GETs on status-only ticks. Always check all
three statuses: an older PR may pass while a nearer one is pending or failed.
A retarget, closure, or newly added leaf can take up to 20 minutes to be
classified while waiting; no stale cache may *decide* the gate. Before opening
or failing, re-read the current PR, decisive predecessor(s) and checks (up to
**3 extra reads for success, 7 for all-failed**). If validation detects changed
PR revisions, refresh topology **immediately**; repeated invalidations back
off instead of hammering GitHub. Pagination, retries, and these exceptional
refreshes add requests; 51/hour is a steady-state estimate, not a hard cap.

GitHub's `GITHUB_TOKEN` primary budget is typically **1,000/hour/repository**
for both REST requests and GraphQL points. Most REST GETs cost one point.
GraphQL may batch data into a one-point query, but the check-run-to-PR base-SHA
association and nested pagination would need independent correctness testing;
this implementation instead takes a measured REST reduction without weakening
the already verified current-base guard. An `ubuntu-slim` runner is unsuitable:
its 15-minute job limit is shorter than the gate's multi-hour wait.
