# config-devtool-dev: PASS

Clean conversion: a single webpack-only dev test was migrated to `nextTestSetup` with proper Turbopack skip guard and preserved inline snapshot.

## Criteria

| #   | Criterion           | Verdict | Note                                                    |
| --- | ------------------- | ------- | ------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                               |
| 1b  | Assertions          | pass    | original: 2 expects, converted: 2 expects               |
| 1c  | Test titles         | pass    | Title preserved verbatim                                |
| 1d  | Describe blocks     | pass    | Single describe preserved                               |
| 2a  | URL paths           | pass    | `/` via `next.browser('/')`                             |
| 2b  | Response checks     | pass    | Redbox snapshot + stderr match preserved                |
| 2c  | FS checks           | na      |                                                         |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`                            |
| 2e  | Build output        | na      |                                                         |
| 2f  | Dynamic logic       | na      |                                                         |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                   |
| 3b  | files param         | pass    | `files: __dirname`                                      |
| 3c  | skipStart           | na      | Dev server needed for stderr capture                    |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                           |
| 3e  | Cleanup             | pass    | browser.close preserved; setup handles app              |
| 4a  | Directory placement | pass    | `test/development/` matches dev-only original           |
| 4b  | Mode guards         | na      | Single-mode test                                        |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST ? describe.skip` wraps outside setup |
| 4d  | Dedup guards        | na      |                                                         |
| 4e  | No incorrect env    | pass    |                                                         |
| 5a  | render              | na      |                                                         |
| 5b  | fetch               | na      |                                                         |
| 5c  | browser             | pass    | `webdriver(port, '/')` → `next.browser('/')`            |
| 5d  | check→retry         | pass    | Uses `retry` for cliOutput polling                      |
| 5e  | File class          | na      |                                                         |
| 5f  | waitFor             | na      |                                                         |
| 5g  | fs operations       | na      | stderr→`next.cliOutput` (appropriate)                   |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `next.config.js` present              |
| 6b  | next.config.js      | pass    | Identical to original                                   |
| 6c  | Overrides           | na      |                                                         |
| 7a  | No dead code        | pass    | Dropped unused win32 TODO branch                        |
| 7b  | retry over timeout  | pass    |                                                         |
| 7c  | async/await         | pass    |                                                         |
| 7d  | eslint              | pass    |                                                         |

## Issues

None.

## Warnings

None.
