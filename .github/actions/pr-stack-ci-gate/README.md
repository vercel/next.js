# PR Stack CI Gate

The `build_and_test` workflow calls this read-only action for same-repository PRs.
It infers branch-based stacks from open PR head/base branch names; no GitHub
stack API or Graphite integration is required. Fork PRs bypass the checkout and
this action entirely and run full CI immediately.

The first three PRs and every leaf run immediately. An internal PR polls the
closest three predecessors every five minutes: **any** current-head/current-base
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
`dist/licenses.txt`. Tests use an isolated Jest config because the repository's
main Jest config searches only the `test/` and package trees. A captured shape
from #99095's actual required-check response lives in `fixtures/`. The workflow
sparse-checks out only `action.yml` and `dist/index.js` from `${{ github.sha }}`;
that is the test-merge commit on PR runs. The caller and action job grant only
`checks: read`, `contents: read` and `pull-requests: read`. No secrets are
inherited, and `persist-credentials` is false.

## API budget and correctness

A stable middle-PR poll rechecks its own PR, finds successors, walks three
predecessor links and checks all three required results: **8 REST calls** versus
11 before this action. The `pulls.list` response already contains head/base
SHAs, so the three extra predecessor `pulls.get` calls are unnecessary while
waiting. Before opening or failing, the action re-reads current PR metadata and
the decisive predecessor(s) and check(s). We cannot stop at the first pending
predecessor: an older PR can already have passed; nor can we permanently cache
a terminal failure because that PR can succeed on rerun. Rechecking live branch
topology on *every* five-minute poll catches retargeted, closed, or leaf PRs at
the original cadence.

GitHub's `GITHUB_TOKEN` primary budget is typically **1,000/hour/repository**
for both REST requests and GraphQL points. Most REST GETs cost one point.
GraphQL may batch data into a one-point query, but the check-run-to-PR base-SHA
association and nested pagination would need independent correctness testing;
this implementation instead takes a measured REST reduction without weakening
the already verified current-base guard. An `ubuntu-slim` runner is unsuitable:
its 15-minute job limit is shorter than the gate's multi-hour wait.
