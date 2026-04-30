# static-page-name: WARN

Conversion is complete and behaviorally equivalent, but the original's Turbopack dedup guards are not preserved in the converted file.

## Criteria

| #   | Criterion           | Verdict | Note                                                                              |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                         |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                         |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                    |
| 1d  | Describe blocks     | pass    | Dev/prod describes flattened into single describe (e2e runs both modes)           |
| 2a  | URL paths           | pass    | `/static` and `/` both covered                                                    |
| 2b  | Response checks     | pass    | HTML match preserved                                                              |
| 2c  | FS checks           | na      |                                                                                   |
| 2d  | Browser checks      | pass    | Click + waitForElementByCss + eval preserved                                      |
| 2e  | Build output        | na      |                                                                                   |
| 2f  | Dynamic logic       | pass    | `runTests()` helper inlined; identical tests for both modes                       |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `'e2e-utils'`                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                |
| 3c  | skipStart           | na      | Not a build-only test                                                             |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                                     |
| 3e  | Cleanup             | pass    | No extra cleanup needed                                                           |
| 4a  | Directory placement | pass    | `test/e2e/` correct; original ran in both dev and prod                            |
| 4b  | Mode guards         | na      | Identical behavior in both modes                                                  |
| 4c  | Turbopack guards    | na      | No turbopack-only/webpack-only skip                                               |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards; converted omits them |
| 4e  | No incorrect env    | pass    | No stray env guards                                                               |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render()`                                                 |
| 5b  | fetch               | na      |                                                                                   |
| 5c  | browser             | pass    | `webdriver` → `next.browser()`                                                    |
| 5d  | check→retry         | na      |                                                                                   |
| 5e  | File class          | na      |                                                                                   |
| 5f  | waitFor             | na      |                                                                                   |
| 5g  | fs operations       | na      |                                                                                   |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/static.js present                                           |
| 6b  | next.config.js      | na      | Original had none                                                                 |
| 6c  | Overrides           | na      |                                                                                   |
| 7a  | No dead code        | pass    |                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                   |
| 7c  | async/await         | pass    |                                                                                   |
| 7d  | eslint              | pass    |                                                                                   |

## Issues

None.

## Warnings

- 4d: Original suite skipped the dev-mode describe when `TURBOPACK_BUILD` is set and the prod-mode describe when `TURBOPACK_DEV` is set (dedup guards to prevent redundant CI runs across turbopack variants). The converted file has no equivalent guard, so both modes will run under both turbopack env variants.
