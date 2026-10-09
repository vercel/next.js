# Reviewed wave-one integration evidence

Validated on 2026-09-16 in `/Users/timneutkens/.codex/worktrees/13d2/next.js-2`.
Base: `602a2aba900e45fb2edd694f463f435430678e1f`, plus the canonical L fixture and
coordinator-reviewed `/tmp/next-testing-integration-wave1.patch`.
Patch SHA-256: `391b81ce68b125374c28db5285a6f94642a39b8a59f59345425bfa34ed69a80d`.
The hash and `git apply --check` were verified before applying.

This wave contains I's independent configuration/discovery, K reporting,
J selection, G private mock registry, F v2 request context, E private render
transport, H v2 browser resources, and M's README correction. A/B/C/D are absent.
The installed baseline native package remains active; no A native artifact was
copied or loaded. These results do not establish `next test` execution.

| Check                                                       | Result               | Local log                               |
| ----------------------------------------------------------- | -------------------- | --------------------------------------- |
| `pnpm --filter=next build` including declaration generation | Passed, 42.73s       | `/tmp/next-testing-L-wave1-build.log`   |
| Seven focused unit suites                                   | 76/76 passed, 6.047s | `/tmp/next-testing-L-wave1-focused.log` |
| F HTTP + H browser route oracle, development                | 6/6 passed, 39.943s  | `/tmp/next-testing-L-wave1-dev.log`     |
| F HTTP + H browser route oracle, production                 | 6/6 passed, 48.358s  | `/tmp/next-testing-L-wave1-prod.log`    |

Exact focused command:

```sh
pnpm exec jest --runInBand --runTestsByPath \
  test/unit/next-testing-cli/next-testing-cli.test.ts \
  test/unit/next-testing-reporting/reporting.test.ts \
  test/unit/next-testing-request-context/request-context.test.ts \
  test/unit/next-testing-rsc-lifecycle/render.test.ts \
  test/unit/next-testing-browser-resources/browser.test.ts \
  test/unit/app-dir/next-testing-incremental/next-testing-incremental.test.ts \
  test/unit/app-dir/next-testing-mocking/next-testing-mocking.test.ts
```

Run each mode with the same two paths:

```sh
pnpm test-dev-turbo \
  test/e2e/app-dir/next-testing-request-cache/next-testing-request-cache.test.ts \
  test/e2e/app-dir/next-testing-browser/next-testing-browser.test.ts
pnpm test-start-turbo \
  test/e2e/app-dir/next-testing-request-cache/next-testing-request-cache.test.ts \
  test/e2e/app-dir/next-testing-browser/next-testing-browser.test.ts
```

F's four HTTP checks establish concurrent cookies/headers/params/URL separation,
render mutation restrictions, per-request React memoization, route-handler
cookie response effects, redirect status and not-found status against real
application routes. The primitive's focused unit suite separately checks its
request stores and nesting rejection; the route oracle does not prove that
primitive has been wired into an isolated compiled render.

H's two browser checks use real Chromium, the actual `instant()` helper, SPA and
fresh-page navigation, completed dynamic UI, nonempty screenshots/traces, and
context disposal. Production enables the testing API deliberately. These are
framework-harness app tests, not Next-owned runner/browser orchestration.

All temporary servers and the watch process started for this wave were stopped.
No source fix was needed. The initial broad `pnpm test-unit` invocation was
cancelled and replaced with `--runTestsByPath`; only the focused completed run
is counted above. Full compiler/runtime/lifecycle/assertion integration and
uninstrumented production omission remain pending.
