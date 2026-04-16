# error-in-error: PASS

Clean 1:1 conversion with proper API migrations and fixture files preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                       |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                  |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                  |
| 1c  | Test titles         | pass    | Both preserved verbatim                                                                                    |
| 1d  | Describe blocks     | pass    | Outer describe kept; inner "production mode" flattened (test is in test/production/)                       |
| 2a  | URL paths           | pass    | `/some-404-page` and `/` preserved                                                                         |
| 2b  | Response checks     | pass    | Both `toMatch(/Internal Server Error/i)` preserved                                                         |
| 2c  | FS checks           | na      |                                                                                                            |
| 2d  | Browser checks      | pass    | click + eval preserved; `waitForElementByCss` → `elementByCss` is acceptable                               |
| 2e  | Build output        | na      |                                                                                                            |
| 2f  | Dynamic logic       | na      |                                                                                                            |
| 3a  | nextTestSetup       | pass    |                                                                                                            |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                         |
| 3c  | skipStart           | na      | Test renders HTTP, needs server running                                                                    |
| 3d  | No manual lifecycle | pass    |                                                                                                            |
| 3e  | Cleanup             | pass    |                                                                                                            |
| 4a  | Directory placement | pass    | Original was production-mode only → test/production/ correct                                               |
| 4b  | Mode guards         | pass    |                                                                                                            |
| 4c  | Turbopack guards    | na      |                                                                                                            |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV` skip was a dev-mode dedup; irrelevant now that the test lives in test/production/ |
| 4e  | No incorrect env    | pass    |                                                                                                            |
| 5a  | render              | pass    |                                                                                                            |
| 5b  | fetch               | na      |                                                                                                            |
| 5c  | browser             | pass    |                                                                                                            |
| 5d  | check→retry         | na      |                                                                                                            |
| 5e  | File class          | na      |                                                                                                            |
| 5f  | waitFor             | pass    | `waitFor(1000)` replaced with `retry()` around the assertion                                               |
| 5g  | fs operations       | na      |                                                                                                            |
| 6a  | Fixtures exist      | pass    | pages/index.js and pages/\_error.js present                                                                |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                             |
| 6c  | Overrides           | na      |                                                                                                            |
| 7a  | No dead code        | pass    |                                                                                                            |
| 7b  | retry over timeout  | pass    |                                                                                                            |
| 7c  | async/await         | pass    |                                                                                                            |
| 7d  | eslint              | pass    |                                                                                                            |

## Issues

None

## Warnings

None
