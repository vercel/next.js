# edge-runtime-dynamic-code: WARN

Conversion preserves all tests and modes correctly, but drops detailed stack-trace assertions in favor of simpler content checks.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                               |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original static its: 7 (1 + 5 dev + 1 prod, multiplied ×2 by describe.each); converted static its: 8 (1 + stub + 5 + 1). Test count equivalent                                                     |
| 1b  | Assertions          | warn    | original ~47 `expect` calls; converted ~41. Detailed stack-trace assertions simplified to presence checks                                                                                          |
| 1c  | Test titles         | pass    | All 6 titles preserved; added "only runs in dev mode" stub                                                                                                                                         |
| 1d  | Describe blocks     | pass    | `development mode` / `production mode` sub-describes flattened into `isNextDev` / `isNextStart` guards, equivalent structure                                                                       |
| 2a  | URL paths           | pass    | `/`, `/using-eval`, `/not-using-eval`, `/using-webassembly-compile`, `/using-webassembly-instantiate-with-buffer`, `/using-webassembly-instantiate` all preserved via `next.fetch` / `next.render` |
| 2b  | Response checks     | warn    | Detailed stack-trace toContain checks (file paths, line numbers, cursors) replaced with simpler `eval('100')` / `WebAssembly.compile` presence checks                                              |
| 2c  | FS checks           | na      | No fs operations                                                                                                                                                                                   |
| 2d  | Browser checks      | na      | No webdriver usage                                                                                                                                                                                 |
| 2e  | Build output        | pass    | `buildResult.stderr` → `next.build()` + `cliOutput` preserved, including turbopack branch                                                                                                          |
| 2f  | Dynamic logic       | pass    | `runTests`-equivalent logic preserved via `isNextDev`/`isNextStart` + `isTurbopack`                                                                                                                |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                                                                                                                              |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                                 |
| 3c  | skipStart           | pass    | Build-only prod block uses `skipStart: true` and explicit `next.build()`                                                                                                                           |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp/nextBuild imports                                                                                                                                                    |
| 3e  | Cleanup             | pass    | nextTestSetup handles lifecycle                                                                                                                                                                    |
| 4a  | Directory placement | pass    | `test/e2e/` correct — suite covers both dev and prod                                                                                                                                               |
| 4b  | Mode guards         | pass    | `isNextDev` / `isNextStart` guards correctly gate the two describe blocks                                                                                                                          |
| 4c  | Turbopack guards    | na      | No turbopack-only skip needed (handled via isTurbopack branching)                                                                                                                                  |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_BUILD`/`TURBOPACK_DEV` guards correctly map to `isNextDev`/`isNextStart` (each mode only runs its own block)                                                                   |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack` from setup, not env vars                                                                                                                                                        |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                                                                                    |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                                                                                                                                                      |
| 5c  | browser             | na      |                                                                                                                                                                                                    |
| 5d  | check→retry         | na      |                                                                                                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                                                                                                    |
| 5f  | waitFor             | pass    | `waitFor(500)` replaced with `retry()` over cliOutput                                                                                                                                              |
| 5g  | fs operations       | na      |                                                                                                                                                                                                    |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/api/route.js, middleware.js, lib/utils.js, lib/wasm.js, lib/square.wasm, next.config.js all present                                                                          |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                                                                                                    |
| 7a  | No dead code        | pass    |                                                                                                                                                                                                    |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                                                                                                                    |

## Issues

None.

## Warnings

- Assertion count dropped ~6 expects (1b). Detailed stack-trace/line-number/cursor-position assertions from the original were replaced with simpler substring checks like `"eval('100')"` and `'WebAssembly.compile'` (2b). This is a reasonable simplification since the original assertions hardcoded `test/integration/edge-runtime-dynamic-code/...` paths that wouldn't match in an isolated test directory, but some signal about correct source-map mapping is lost.
