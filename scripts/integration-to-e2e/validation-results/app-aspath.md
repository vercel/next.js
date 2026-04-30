# app-aspath: PASS

Clean conversion of a single dev-mode hot-reload test with proper `next.patchFile()` and `retry()` usage.

## Criteria

| #   | Criterion           | Verdict | Note                                      |
| --- | ------------------- | ------- | ----------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                 |
| 1b  | Assertions          | pass    | original: 2, converted: 2                 |
| 1c  | Test titles         | pass    | Preserved verbatim                        |
| 1d  | Describe blocks     | pass    | Single describe preserved                 |
| 2a  | URL paths           | pass    | `/` accessed                              |
| 2b  | Response checks     | pass    | Body text equality preserved              |
| 2c  | FS checks           | pass    | Uses `next.readFile`/`next.patchFile`     |
| 2d  | Browser checks      | pass    | `next.browser` + `elementByCss`           |
| 2e  | Build output        | na      |                                           |
| 2f  | Dynamic logic       | na      |                                           |
| 3a  | nextTestSetup       | pass    |                                           |
| 3b  | files param         | pass    | `__dirname`                               |
| 3c  | skipStart           | na      | Not build-only                            |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp                     |
| 3e  | Cleanup             | pass    | Isolated copy, no explicit restore needed |
| 4a  | Directory placement | pass    | `test/development/` correct (HMR test)    |
| 4b  | Mode guards         | na      |                                           |
| 4c  | Turbopack guards    | na      |                                           |
| 4d  | Dedup guards        | na      |                                           |
| 4e  | No incorrect env    | pass    |                                           |
| 5a  | render              | na      |                                           |
| 5b  | fetch               | na      |                                           |
| 5c  | browser             | pass    |                                           |
| 5d  | check→retry         | na      |                                           |
| 5e  | File class          | pass    | Uses `next.patchFile`                     |
| 5f  | waitFor             | pass    | Replaced `waitFor(5000)` with `retry()`   |
| 5g  | fs operations       | pass    |                                           |
| 6a  | Fixtures exist      | pass    | `pages/_app.js`, `pages/index.js` present |
| 6b  | next.config.js      | na      | Original had none                         |
| 6c  | Overrides           | na      |                                           |
| 7a  | No dead code        | pass    |                                           |
| 7b  | retry over timeout  | pass    |                                           |
| 7c  | async/await         | pass    |                                           |
| 7d  | eslint              | pass    |                                           |

## Issues

None

## Warnings

None
