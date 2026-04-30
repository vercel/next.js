# css-features: PASS

The css-features integration suite was correctly split across `test/production/` files with all 10 original tests preserved, proper `nextTestSetup` usage, `skipStart: true` for build-only tests, and all fixtures in place.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                                       |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 10, converted: 10 (across browserslist.test.ts, css-modules.test.ts, css-features.test.ts)                                                                                                       |
| 1b  | Assertions          | warn    | original: 34, converted: 33 — Inline Comments dropped the turbopack snapshot branch (describe is skipped for turbopack, so branch was dead)                                                                |
| 1c  | Test titles         | pass    | All 10 titles preserved verbatim                                                                                                                                                                           |
| 1d  | Describe blocks     | pass    | All 10 describes preserved                                                                                                                                                                                 |
| 2a  | URL paths           | pass    | `/` + stylesheet href fetched via `next.render$()` + `next.fetch()`                                                                                                                                        |
| 2b  | Response checks     | pass    | length + snapshot assertions preserved                                                                                                                                                                     |
| 2c  | FS checks           | na      | No direct fs reads in original                                                                                                                                                                             |
| 2d  | Browser checks      | na      | Original has no browser interactions                                                                                                                                                                       |
| 2e  | Build output        | pass    | `nextBuild → next.build()`; `stderr → cliOutput`; `code → exitCode`                                                                                                                                        |
| 2f  | Dynamic logic       | na      | No runTests() helpers                                                                                                                                                                                      |
| 3a  | nextTestSetup       | pass    | All three converted files use `nextTestSetup` from `e2e-utils`                                                                                                                                             |
| 3b  | files param         | pass    | `files: join(__dirname, 'fixtures', '<name>')`                                                                                                                                                             |
| 3c  | skipStart           | pass    | Build-only tests (Fail for :root, Fail for global element, Importing Invalid) use `skipStart: true`                                                                                                        |
| 3d  | No manual lifecycle | pass    | No `findPort`, `killApp`, `nextStart`, `nextBuild` imports                                                                                                                                                 |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                                                                                   |
| 4a  | Directory placement | pass    | All originals were prod-only → correctly in `test/production/`                                                                                                                                             |
| 4b  | Mode guards         | na      | No dev/prod differentiation in originals                                                                                                                                                                   |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST` wrapping outside `nextTestSetup` for Invalid/Exports/:root/Inline; inner branches use `isTurbopack` from setup                                                                         |
| 4d  | Dedup guards        | warn    | Original used `TURBOPACK_DEV ? describe.skip : describe` — not strictly needed in `test/production/` (only one mode runs) but not reproduced. Acceptable since prod dir only runs in build mode.           |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV` / `TURBOPACK_BUILD` usage in converted                                                                                                                                                  |
| 5a  | render              | pass    | `renderViaHTTP → next.render$()`                                                                                                                                                                           |
| 5b  | fetch               | pass    | `fetchViaHTTP → next.fetch()`                                                                                                                                                                              |
| 5c  | browser             | na      |                                                                                                                                                                                                            |
| 5d  | check→retry         | na      |                                                                                                                                                                                                            |
| 5e  | File class          | na      |                                                                                                                                                                                                            |
| 5f  | waitFor             | na      |                                                                                                                                                                                                            |
| 5g  | fs operations       | na      |                                                                                                                                                                                                            |
| 6a  | Fixtures exist      | pass    | All 10 fixture dirs present: browsers-old, browsers-new, cp-global-modules, cp-el-modules, module-import-global, module-import-global-invalid, module-import-exports, cp-ie-11, cp-modern, inline-comments |
| 6b  | next.config.js      | pass    | Original fixtures also had no next.config.js (they use package.json/pages only); parity preserved                                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                                                                                                            |
| 7a  | No dead code        | pass    | Dead turbopack branches appropriately removed                                                                                                                                                              |
| 7b  | retry over timeout  | na      | No polling needed                                                                                                                                                                                          |
| 7c  | async/await         | pass    |                                                                                                                                                                                                            |
| 7d  | eslint              | pass    | `jest/no-identical-title` disabled where needed                                                                                                                                                            |

## Issues

None.

## Warnings

- 1b: One fewer `expect()` call (33 vs 34) because the Inline Comments converted test drops the turbopack snapshot branch. This is appropriate dead-code removal since the whole describe is skipped for turbopack, but worth noting.
- 4d: Original dedup `TURBOPACK_DEV ? describe.skip : describe` wrappers were not mapped to the `(isNextStart && !!process.env.TURBOPACK_DEV) || ...` pattern. This is acceptable here because `test/production/` tests only run in build mode, so the dedup guard was effectively redundant after the dir-based split.

Note: The converted directory contains additional test files (`basic-global-support.test.ts`, `css-compilation.test.ts`, `css-modules-support.test.ts`, `css-modules-ordering.test.ts`, `css-rendering.test.ts`, `valid-invalid-css.test.ts`, `test/development/*`, `test/e2e/*`) that do not correspond to the original css-features integration suite — they presumably belong to conversions of other integration suites (e.g. `test/integration/css`). Those are out of scope for this validation.
