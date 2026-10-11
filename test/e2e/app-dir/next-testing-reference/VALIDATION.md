# Next testing reference validation

Baseline Next revision: `602a2aba900e45fb2edd694f463f435430678e1f`.
Vitest target revision: `0780a8e5b7967a4168173599e9c74fb79aab2483`.

This generated normal Next app is the independent oracle for compilation,
rendering and browser workstreams. It does not use the proposed Next runner.
A passing oracle alone does not establish Next-runner compatibility.

| Behavior                                                    | Normal app oracle                            | Next testing integration                                                    |
| ----------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| Ordinary module: sum([2,3,5]) = 10                          | Passed dev + instrumented production         | Passed RSC direct throws/expect and unchanged Node corpus                   |
| Async RSC, nested async server-only dependency              | Passed dev + instrumented production         | Passed normalized nested server text and real rendering                     |
| Client boundary serializes initial=10 and hydrates          | Passed dev + instrumented production browser | Exact identity/props and actual browser CLI hydration passed                |
| Concurrent request cookies remain separate                  | Passed dev + instrumented production         | Passed concurrent render cookies                                            |
| Actual instant shell, dynamic release, hydrated interaction | Passed dev + instrumented production browser | Actual browser CLI shell/release/hydration passed                           |
| Function prop serialization rejected                        | Fixture only; pending negative test          | Passed real serializer rejection                                            |
| Client import of server-only module rejected                | Fixture only; pending negative test          | Pending compiler                                                            |
| Hook cleanup and retry attempt state                        | Vitest source expectation; execution pending | Unchanged lifecycle and terminal scope guards passed                        |
| Async assertions, spy results, clear keeps implementation   | Vitest source expectation; execution pending | Actual compiled assertion/spy corpus passed                                 |
| Fresh execution module/cache/browser isolation              | Pending corpus                               | File cache/drain and browser retry isolation passed; external data excluded |
| Normal production build excludes testing transport          | Passed uninstrumented production semantics   | Bounded artifact/trace omission checks passed                               |

Commands for the normal app:

```sh
pnpm test-dev-turbo test/e2e/app-dir/next-testing-reference/next-testing-reference.test.ts
pnpm test-start-turbo test/e2e/app-dir/next-testing-reference/next-testing-reference.test.ts
```

`next.config.js` opts into the testing API for instrumented production only.
This is not normal-production omission evidence. The negative subjects live
outside `app` so the positive app can build; rejection checks must explicitly
compile/render them and assert the diagnostic, never count their presence as a pass.

`conformance/*.case.mjs` are authored Vitest cases, not Jest tests or evidence
of an executed runner. Configure both runners to discover these exact files
once their entry contracts are available. Pinned upstream source expectations:
`test/unit/test/hooks.test.ts` (returned cleanup),
`test/unit/test/retry.test.ts` (retry attempts preserve module state), and
`test/unit/test/spy.test.ts` plus `packages/spy/src/index.ts` (spy lifecycle).
The checkout at `/Users/timneutkens/projects/vitest` remains read-only.

## Recorded evidence

On 2026-09-16, at the baseline revision plus this fixture:

- `pnpm install --frozen-lockfile` passed in 2m 24.9s.
- `CI=1 pnpm build-all` passed: 18/18 tasks, 1m 13.091s.
- Development command above passed: 3/3 tests, 25.956s.
- Production command above passed: 3/3 tests, 20.904s.
- Prettier and ESLint passed; the three conformance modules passed syntax checks.

Both browser runs use Chromium through the existing repository Playwright
harness and the actual `@next/playwright` helper. Native compilation uses the
installed baseline `@next/swc-darwin-arm64` package; it does not validate future
Rust changes in the test-entry compiler. The production run is instrumented.
No Next-owned testing runner integration or Vitest conformance run has passed yet.

Local evidence logs (not part of the patch):
`/tmp/next-testing-L-install.log`, `/tmp/next-testing-L-build-ci.log`,
`/tmp/next-testing-L-dev.log`, `/tmp/next-testing-L-prod.log`.

Initial bootstrap attempts with shared dependency symlinks failed (missing
per-package loaders, then an out-of-root Turbopack symlink). Those links were
removed before the real install. Plain bootstrap attempted a native rebuild
because version-bump history was unavailable and hit sandbox IPC EPERM. The
successful CI-mode build used the normal installed-native path with escalation
for local IPC. Watch processes started for this work were stopped after EMFILE.
