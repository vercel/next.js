# invalid-revalidate-values: PASS

Clean 1:1 conversion — all 6 tests preserved, correct dev-mode placement, proper use of `next.patchFile` and `retry`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                      |
| --- | ------------------- | ------- | ------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 6, converted: 6                                                 |
| 1b  | Assertions          | pass    | original: 6, converted: 6                                                 |
| 1c  | Test titles         | pass    | All 6 titles preserved verbatim                                           |
| 1d  | Describe blocks     | pass    | Single describe preserved                                                 |
| 2a  | URL paths           | pass    | `/ssg` preserved                                                          |
| 2b  | Response checks     | pass    | HTML content + regex matches preserved                                    |
| 2c  | FS checks           | pass    | Uses `next.readFile`/`next.patchFile`                                     |
| 2d  | Browser checks      | na      |                                                                           |
| 2e  | Build output        | na      |                                                                           |
| 2f  | Dynamic logic       | na      |                                                                           |
| 3a  | nextTestSetup       | pass    |                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                        |
| 3c  | skipStart           | na      | Dev server test, needs start                                              |
| 3d  | No manual lifecycle | pass    |                                                                           |
| 3e  | Cleanup             | pass    | Restores file content at end of each test                                 |
| 4a  | Directory placement | pass    | Original used `launchApp` (dev) → `test/development/` correct             |
| 4b  | Mode guards         | na      |                                                                           |
| 4c  | Turbopack guards    | na      |                                                                           |
| 4d  | Dedup guards        | na      |                                                                           |
| 4e  | No incorrect env    | pass    |                                                                           |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                           |
| 5b  | fetch               | na      |                                                                           |
| 5c  | browser             | na      |                                                                           |
| 5d  | check→retry         | pass    | `check()` → `retry() + expect()`                                          |
| 5e  | File class          | pass    | `new File()`/`.replace()`/`.restore()` → `next.readFile`/`next.patchFile` |
| 5f  | waitFor             | pass    | `waitFor(1000)` loop → `retry()`                                          |
| 5g  | fs operations       | pass    | Uses `next.readFile`                                                      |
| 6a  | Fixtures exist      | pass    | `pages/ssg.js` present with `revalidate: 1`                               |
| 6b  | next.config.js      | na      | Original had none                                                         |
| 6c  | Overrides           | na      |                                                                           |
| 7a  | No dead code        | pass    |                                                                           |
| 7b  | retry over timeout  | pass    |                                                                           |
| 7c  | async/await         | pass    |                                                                           |
| 7d  | eslint              | pass    |                                                                           |

## Issues

None

## Warnings

None
