# edge-runtime-configurable-guards: PASS

Conversion preserves all tests and assertions, correctly splits into dev/prod blocks via `isNextDev`/`isNextStart` guards, and replaces `new File` with `patchFile`/`readFile` save-restore.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                        |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 9 `it(` (19 w/ `describe.each` expansion), converted: 9 `it(` (19 w/ expansion)                                                   |
| 1b  | Assertions          | pass    | original: 26, converted: 26                                                                                                                 |
| 1c  | Test titles         | pass    | All 9 titles preserved verbatim                                                                                                             |
| 1d  | Describe blocks     | pass    | Reorganized into outer dev/prod wrappers; inner structure preserved                                                                         |
| 2a  | URL paths           | pass    | `/` and `/api/route` both covered                                                                                                           |
| 2b  | Response checks     | pass    | status, cliOutput contains/not-contains, exitCode all preserved                                                                             |
| 2c  | FS checks           | pass    | Uses `next.readFile`/`patchFile` to save+restore instead of `File.write/.restore`                                                           |
| 2d  | Browser checks      | na      | No browser use in original                                                                                                                  |
| 2e  | Build output        | pass    | `next.build()` + `next.cliOutput.slice()` replaces `nextBuild()` stdout/stderr                                                              |
| 2f  | Dynamic logic       | pass    | `runTests(mode)` split into explicit dev/prod describe blocks                                                                               |
| 3a  | nextTestSetup       | pass    | Used in both dev and prod blocks                                                                                                            |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                          |
| 3c  | skipStart           | pass    | Prod block uses `skipStart: true` and calls `next.build()`/`next.start()` manually                                                          |
| 3d  | No manual lifecycle | pass    | No `launchApp`/`killApp`/`nextBuild` imports                                                                                                |
| 3e  | Cleanup             | pass    | `afterEach` restores original files via `patchFile`                                                                                         |
| 4a  | Directory placement | pass    | `test/e2e/` is correct since both dev and prod cases exist                                                                                  |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` wrappers replace mixed-mode describe                                                                              |
| 4c  | Turbopack guards    | pass    | Uses `isTurbopack` from `nextTestSetup()` for per-item skip (not `describe.skip` wrap since it's per-case)                                  |
| 4d  | Dedup guards        | pass    | `TURBOPACK_DEV` skip for prod block is effectively replaced by `isNextStart` gating                                                         |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack` and `shouldUseTurbopack()` helpers                                                                                       |
| 5a  | render              | na      | Original used fetchViaHTTP, not renderViaHTTP                                                                                               |
| 5b  | fetch               | pass    | `fetchViaHTTP(port, url)` → `next.fetch(url)`                                                                                               |
| 5c  | browser             | na      |                                                                                                                                             |
| 5d  | check→retry         | pass    | `retry()` preserved; no `check()` calls                                                                                                     |
| 5e  | File class          | pass    | `new File(...).write()/.restore()` replaced with save-in-beforeAll + `patchFile` restore                                                    |
| 5f  | waitFor             | warn    | Dev-mode "does not warn" test dropped the `waitFor(500)` before negative assertion; other `waitFor` calls correctly replaced with `retry()` |
| 5g  | fs operations       | pass    | Uses `next.readFile` / `next.patchFile`                                                                                                     |
| 6a  | Fixtures exist      | pass    | middleware.js, pages/api/route.js, pages/index.js, node_modules/.pnpm/.../lib/index.js + package.json all present                           |
| 6b  | next.config.js      | na      | Original had none; converted has none                                                                                                       |
| 6c  | Overrides           | na      |                                                                                                                                             |
| 7a  | No dead code        | pass    |                                                                                                                                             |
| 7b  | retry over timeout  | pass    | retry() used for polling                                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                                                             |
| 7d  | eslint              | pass    | Proper `// eslint-disable-next-line jest/no-identical-title` for duplicate dev/prod describe title                                          |

## Issues

None

## Warnings

- The "Function as a type" dev tests replaced `waitFor(500)` before the `.not.toContain` assertion with no wait. For negative log assertions this slightly weakens the guarantee (a delayed warning could now race the assertion), but the risk is low since the fetch completes before the assertion.
