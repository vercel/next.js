# 500-page: WARN

Solid conversion with all tests and assertions preserved, but the build-validation describe lacks an `isNextStart` guard and will run redundantly in dev modes.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                             |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 19 `it(`, converted: 19 `it(`                                                                                                          |
| 1b  | Assertions          | pass    | original: 47 `expect(`, converted: 47 `expect(`                                                                                                  |
| 1c  | Test titles         | pass    | All 19 titles present (minor wording on GIP \_app test)                                                                                          |
| 1d  | Describe blocks     | pass    | Flattened into two describes (runtime + build validation)                                                                                        |
| 2a  | URL paths           | pass    | /500, /err, /abc, /err?hello=world all preserved                                                                                                 |
| 2b  | Response checks     | pass    | status codes, cache-control header, html content all checked                                                                                     |
| 2c  | FS checks           | pass    | uses `next.readJSON`, `next.hasFile` instead of raw fs                                                                                           |
| 2d  | Browser checks      | pass    | `next.browser('/err?hello=world')` + `document.title` evals preserved                                                                            |
| 2e  | Build output        | pass    | uses `next.build()` + `exitCode`/`cliOutput`                                                                                                     |
| 2f  | Dynamic logic       | pass    | `runTests(mode)` translated into `isNextDev`/`isNextStart` gated blocks                                                                          |
| 3a  | nextTestSetup       | pass    | Two `nextTestSetup()` calls                                                                                                                      |
| 3b  | files param         | pass    | Both use `files: __dirname`                                                                                                                      |
| 3c  | skipStart           | pass    | Build-validation describe uses `skipStart: true` with explicit `next.build()`/`next.start()`                                                     |
| 3d  | No manual lifecycle | pass    | No `findPort`/`launchApp`/`killApp` imports                                                                                                      |
| 3e  | Cleanup             | pass    | `patchFile` in try/finally where needed; isolated dirs handle rest                                                                               |
| 4a  | Directory placement | warn    | Build-validation describe is in `test/e2e/` but is effectively build-only; belongs in `test/production/`                                         |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` used for the mode-specific first describe                                                                              |
| 4c  | Turbopack guards    | na      | Original had no webpack/turbopack-only skips, just dedup guards                                                                                  |
| 4d  | Dedup guards        | warn    | Original used `TURBOPACK_DEV`/`TURBOPACK_BUILD` skip guards for dedup; build-validation block has no mode guard and will run 4× across CI matrix |
| 4e  | No incorrect env    | pass    | No direct use of `process.env.TURBOPACK_DEV/BUILD`                                                                                               |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render()`                                                                                                                |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch()`                                                                                                                  |
| 5c  | browser             | pass    | `webdriver` → `next.browser()`                                                                                                                   |
| 5d  | check→retry         | pass    | dev-mode stderr checks use `retry()` + `expect`                                                                                                  |
| 5e  | File class          | na      | Original didn't use File                                                                                                                         |
| 5f  | waitFor             | pass    | `waitFor(1000)` replaced by `retry()` around `next.cliOutput`                                                                                    |
| 5g  | fs operations       | pass    | `fs-extra` replaced with `next.readFile`/`readJSON`/`hasFile`/`patchFile`/`deleteFile`                                                           |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/500.js, pages/err.js, pages/index.js all present and byte-identical to original                                            |
| 6b  | next.config.js      | pass    | Present                                                                                                                                          |
| 6c  | Overrides           | na      | No overrides used                                                                                                                                |
| 7a  | No dead code        | pass    | No commented-out tests or unused imports                                                                                                         |
| 7b  | retry over timeout  | pass    | Uses `retry()` for async log checks                                                                                                              |
| 7c  | async/await         | pass    | All awaits in place                                                                                                                              |
| 7d  | eslint              | pass    | No obvious violations                                                                                                                            |

## Issues

None.

## Warnings

- The `describe('500 Page build validation', …)` block in `test/e2e/500-page/500-page.test.ts` contains build-only tests (each calls `next.build()` with `skipStart: true`). With no `isNextStart` guard and placement under `test/e2e/`, these tests will execute across dev webpack, dev turbopack, start webpack, and start turbopack shards — losing the dedup previously provided by the original `TURBOPACK_DEV ? describe.skip : describe` guard. Either move this describe into `test/production/500-page/` or wrap it with `isNextStart` to restore single-mode execution.
- `app-router-only`, `mixed-router-no-custom-pages-error`, and `mixed-router-with-custom-pages-error` under `test/production/500-page/` are pre-existing tests (not conversions of the integration suite) per git history; they were not evaluated as conversion output.
