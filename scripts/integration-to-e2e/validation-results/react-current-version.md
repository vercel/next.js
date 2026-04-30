# react-current-version: PASS

Conversion preserves all tests, assertions, and runtime-specific behavior with proper API migrations and fixture overrides.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 8 `it(` calls, converted: 8 `it(` calls (runtime tests invoked twice via describeConcurrentMode, same as original runTestsAgainstRuntime)   |
| 1b  | Assertions          | pass    | original: 11 `expect(`, converted: 11 `expect(`                                                                                                       |
| 1c  | Test titles         | pass    | All 8 titles preserved verbatim                                                                                                                       |
| 1d  | Describe blocks     | pass    | Basics + `Concurrent mode in the <runtime> runtime` + nested `<RouteAnnouncer />` preserved                                                           |
| 2a  | URL paths           | pass    | `/`, `/use-id`, `/dynamic`, `/use-flush-effect/styled-jsx` all covered                                                                                |
| 2b  | Response checks     | pass    | HTML/cheerio assertions, cliOutput checks preserved                                                                                                   |
| 2c  | FS checks           | na      | No filesystem assertions                                                                                                                              |
| 2d  | Browser checks      | pass    | webdriver → next.browser() with same selectors and evals                                                                                              |
| 2e  | Build output        | na      | No build assertions                                                                                                                                   |
| 2f  | Dynamic logic       | pass    | dev/prod branch in dynamicIds test mapped to `isNextDev`                                                                                              |
| 3a  | nextTestSetup       | pass    | Used for both Basics and runtime describes                                                                                                            |
| 3b  | files param         | pass    | `join(__dirname, 'app')` points to fixture dir                                                                                                        |
| 3c  | skipStart           | na      | Not a build-only test                                                                                                                                 |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp usage                                                                                                                   |
| 3e  | Cleanup             | pass    | `indexPage.replace/restore` replaced with `overrideFiles` per-describe setup                                                                          |
| 4a  | Directory placement | pass    | test/e2e/ correct — original used runDevSuite + runProdSuite                                                                                          |
| 4b  | Mode guards         | pass    | `isNextDev` used for dev-only branch                                                                                                                  |
| 4c  | Turbopack guards    | pass    | Uses `isTurbopack` from nextTestSetup (not a skip guard)                                                                                              |
| 4d  | Dedup guards        | na      | None in original                                                                                                                                      |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD usage                                                                                                                          |
| 5a  | render              | pass    | renderViaHTTP → next.render() / next.render$()                                                                                                        |
| 5b  | fetch               | na      | No fetchViaHTTP calls                                                                                                                                 |
| 5c  | browser             | pass    | webdriver → next.browser()                                                                                                                            |
| 5d  | check→retry         | pass    | Both `check()` calls converted to `retry()` + `expect()`                                                                                              |
| 5e  | File class          | pass    | `new File(...).replace()/.restore()` replaced with `overrideFiles: { 'pages/index.js': makeIndexPage(runtime) }`                                      |
| 5f  | waitFor             | na      | Not used                                                                                                                                              |
| 5g  | fs operations       | na      | None                                                                                                                                                  |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/use-id.js, pages/dynamic.js, pages/use-flush-effect/styled-jsx.tsx, components/foo.js, next.config.js, package.json all present |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                                                                |
| 6c  | Overrides           | pass    | `overrideFiles` with makeIndexPage(runtime) equivalent to original `indexPage.replace("// runtime: 'experimental-edge'", runtime)`                    |
| 7a  | No dead code        | pass    |                                                                                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                                                       |

## Issues

None

## Warnings

- Original used separate `context.stdout` / `context.stderr` streams; converted uses combined `next.cliOutput`. Acceptable since warnings/render logs are still searchable, but a noisy stderr could theoretically match a stdout-only pattern (not a real concern for these assertions).
