# future: PASS

Clean 1:1 conversion of a single-test suite. Fixture files and config preserved exactly, with webdriver migrated to `next.browser()` and moment dependency declared.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                   |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                              |
| 1b  | Assertions          | pass    | original: 3 expects, converted: 3 expects                                                              |
| 1c  | Test titles         | pass    | "should load momentjs" preserved                                                                       |
| 1d  | Describe blocks     | pass    | Inner "production mode" describe appropriately flattened (location handles mode)                       |
| 2a  | URL paths           | pass    | "/" accessed via `next.browser('/')`                                                                   |
| 2b  | Response checks     | pass    | h1 text, moment.locales() checks preserved                                                             |
| 2c  | FS checks           | na      |                                                                                                        |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`, same selectors/eval                                                      |
| 2e  | Build output        | na      |                                                                                                        |
| 2f  | Dynamic logic       | na      |                                                                                                        |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                                                     |
| 3c  | skipStart           | na      | Full server lifecycle needed                                                                           |
| 3d  | No manual lifecycle | pass    | No `findPort`/`killApp`/`nextBuild`/`nextStart`                                                        |
| 3e  | Cleanup             | pass    | `browser.close()` preserved; no other cleanup needed                                                   |
| 4a  | Directory placement | pass    | `test/production/` matches original prod-only scope                                                    |
| 4b  | Mode guards         | na      | Single-mode test                                                                                       |
| 4c  | Turbopack guards    | na      | Original `TURBOPACK_DEV` guard was a dedup mechanism for dev runs; not needed under `test/production/` |
| 4d  | Dedup guards        | pass    | Handled implicitly by directory placement                                                              |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` usage                                                             |
| 5a  | render              | na      |                                                                                                        |
| 5b  | fetch               | na      |                                                                                                        |
| 5c  | browser             | pass    | `webdriver(port, '/')` → `next.browser('/')`                                                           |
| 5d  | check→retry         | na      |                                                                                                        |
| 5e  | File class          | na      |                                                                                                        |
| 5f  | waitFor             | na      |                                                                                                        |
| 5g  | fs operations       | na      |                                                                                                        |
| 6a  | Fixtures exist      | pass    | `pages/index.js` and `next.config.js` present                                                          |
| 6b  | next.config.js      | pass    | Identical empty config copied                                                                          |
| 6c  | Overrides           | na      |                                                                                                        |
| 7a  | No dead code        | pass    |                                                                                                        |
| 7b  | retry over timeout  | pass    |                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                        |

## Issues

None

## Warnings

None
