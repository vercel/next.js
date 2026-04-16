# next-dynamic-css: PASS

Clean 1:1 conversion of a simple 2-test dev+prod suite to `nextTestSetup` with fixtures intact.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 (in runTests, run in both modes); converted: 2 (run per mode by harness)                                                |
| 1b  | Assertions          | pass    | original: 4; converted: 4                                                                                                           |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                                      |
| 1d  | Describe blocks     | pass    | Mode-specific describes collapsed into a single describe; harness handles mode split                                                |
| 2a  | URL paths           | pass    | `/` and `/test-app` both covered                                                                                                    |
| 2b  | Response checks     | pass    | Same computed CSS + innerHTML assertions                                                                                            |
| 2c  | FS checks           | na      |                                                                                                                                     |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser` with same selectors                                                                                    |
| 2e  | Build output        | na      |                                                                                                                                     |
| 2f  | Dynamic logic       | na      | runTests() logic is identical for both modes; no per-mode branching needed                                                          |
| 3a  | nextTestSetup       | pass    |                                                                                                                                     |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                  |
| 3c  | skipStart           | na      | Not build-only                                                                                                                      |
| 3d  | No manual lifecycle | pass    | No `findPort`/`launchApp`/etc                                                                                                       |
| 3e  | Cleanup             | pass    | Handled by harness                                                                                                                  |
| 4a  | Directory placement | pass    | `test/e2e/` correct (runs in dev+prod)                                                                                              |
| 4b  | Mode guards         | na      | Identical behavior in both modes                                                                                                    |
| 4c  | Turbopack guards    | na      | Not turbopack-specific                                                                                                              |
| 4d  | Dedup guards        | pass    | Original guards were the old-style per-mode dedup; e2e harness provides canonical dev/start split and dedup is handled at job level |
| 4e  | No incorrect env    | pass    |                                                                                                                                     |
| 5a  | render              | na      |                                                                                                                                     |
| 5b  | fetch               | na      |                                                                                                                                     |
| 5c  | browser             | pass    |                                                                                                                                     |
| 5d  | check→retry         | na      |                                                                                                                                     |
| 5e  | File class          | na      |                                                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                                                     |
| 5g  | fs operations       | na      |                                                                                                                                     |
| 6a  | Fixtures exist      | pass    | pages/index.jsx, app/test-app/page.tsx, Content/Component2, next.config.js, tsconfig.json all present                               |
| 6b  | next.config.js      | pass    | Copied                                                                                                                              |
| 6c  | Overrides           | na      |                                                                                                                                     |
| 7a  | No dead code        | pass    |                                                                                                                                     |
| 7b  | retry over timeout  | na      |                                                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                                                     |

## Issues

None.

## Warnings

None.
