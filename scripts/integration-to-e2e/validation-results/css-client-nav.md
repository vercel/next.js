# css-client-nav: PASS

Conversion preserves all tests, assertions, fixtures, and mode-specific behavior (proxy/stall logic gated to `isNextStart`, dev navigation via `next.browser()`).

## Criteria

| #   | Criterion           | Verdict | Note                                                                                            |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5 `it(`, converted: 5 `it(`                                                           |
| 1b  | Assertions          | pass    | Preserved incl. 2 conditional prod-only preload checks                                          |
| 1c  | Test titles         | pass    | All 5 titles match                                                                              |
| 1d  | Describe blocks     | pass    | prod/dev describes flattened via `isNextDev`/`isNextStart` guards                               |
| 2a  | URL paths           | pass    | /red, /blue, /none all covered                                                                  |
| 2b  | Response checks     | pass    | preload/prefetch selector asserts preserved                                                     |
| 2c  | FS checks           | na      | No fs checks                                                                                    |
| 2d  | Browser checks      | pass    | Same selectors/interactions; uses `webdriver` via proxy in prod, `next.browser()` in dev        |
| 2e  | Build output        | na      | No build output checks                                                                          |
| 2f  | Dynamic logic       | pass    | `runTests(dev)` inlined; blue-to-red preload branch guarded by `!isNextDev`                     |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup({ files: __dirname, skipStart: true })`                                     |
| 3b  | files param         | pass    | `files: __dirname`                                                                              |
| 3c  | skipStart           | pass    | Manual build+start in `beforeAll` to set up proxy                                               |
| 3d  | No manual lifecycle | pass    | `findPort` used for proxy port (allowlisted external-server use)                                |
| 3e  | Cleanup             | pass    | Proxy server closed in `afterAll`; next lifecycle handled by setup                              |
| 4a  | Directory placement | pass    | `test/e2e/` — original ran in both dev & prod                                                   |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` used correctly                                                        |
| 4c  | Turbopack guards    | na      | Original had no Turbopack-only skip                                                             |
| 4d  | Dedup guards        | na      | Original `TURBOPACK_DEV` guard was integration-specific; e2e runs in separate jobs              |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` usage                                                      |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render()`                                                               |
| 5b  | fetch               | na      | No fetchViaHTTP                                                                                 |
| 5c  | browser             | pass    | Uses `next.browser()` for dev; direct `webdriver(proxyPort,...)` for prod proxy                 |
| 5d  | check→retry         | na      | No `check()` usage                                                                              |
| 5e  | File class          | na      | Not used                                                                                        |
| 5f  | waitFor             | na      | `setTimeout` used only as intentional CSS-stall delay                                           |
| 5g  | fs operations       | na      | No direct fs                                                                                    |
| 6a  | Fixtures exist      | pass    | pages/red.js, blue.js, none.js, \_app.js, \*.module.css, global.css, next.config.js all present |
| 6b  | next.config.js      | pass    | Present                                                                                         |
| 6c  | Overrides           | na      | None                                                                                            |
| 7a  | No dead code        | pass    |                                                                                                 |
| 7b  | retry over timeout  | pass    |                                                                                                 |
| 7c  | async/await         | pass    |                                                                                                 |
| 7d  | eslint              | pass    | `jest/no-standalone-expect` disabled at top (reasonable due to conditional it.skip)             |

## Issues

None

## Warnings

None
