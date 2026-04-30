Files identical. No next.config.js in either.

# webpack-bun-externals: PASS

Clean 1:1 conversion — all 3 tests, assertions, titles, and Turbopack guard preserved; uses `skipStart: true` and `next.build()` correctly.

## Criteria

| #   | Criterion           | Verdict | Note                                                      |
| --- | ------------------- | ------- | --------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                 |
| 1b  | Assertions          | pass    | original: 3 (+ 6 inside forEach), converted: same         |
| 1c  | Test titles         | pass    | All three preserved verbatim                              |
| 1d  | Describe blocks     | pass    | Single describe preserved                                 |
| 2a  | URL paths           | na      | No HTTP calls                                             |
| 2b  | Response checks     | na      |                                                           |
| 2c  | FS checks           | pass    | `fs.readFile(join(appDir, ...))` → `next.readFile(...)`   |
| 2d  | Browser checks      | na      |                                                           |
| 2e  | Build output        | pass    | `nextBuild().code` → `next.build().exitCode`              |
| 2f  | Dynamic logic       | na      |                                                           |
| 3a  | nextTestSetup       | pass    |                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                        |
| 3c  | skipStart           | pass    | Build-only test, correct                                  |
| 3d  | No manual lifecycle | pass    |                                                           |
| 3e  | Cleanup             | pass    | No extra cleanup needed                                   |
| 4a  | Directory placement | pass    | test/production/ for build-only                           |
| 4b  | Mode guards         | na      |                                                           |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST` wraps outside describe body correctly |
| 4d  | Dedup guards        | na      |                                                           |
| 4e  | No incorrect env    | pass    |                                                           |
| 5a  | render              | na      |                                                           |
| 5b  | fetch               | na      |                                                           |
| 5c  | browser             | na      |                                                           |
| 5d  | check→retry         | na      |                                                           |
| 5e  | File class          | na      |                                                           |
| 5f  | waitFor             | na      |                                                           |
| 5g  | fs operations       | pass    | Uses `next.readFile()`                                    |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present, matches original                |
| 6b  | next.config.js      | na      | Neither had one                                           |
| 6c  | Overrides           | na      |                                                           |
| 7a  | No dead code        | pass    |                                                           |
| 7b  | retry over timeout  | na      |                                                           |
| 7c  | async/await         | pass    |                                                           |
| 7d  | eslint              | pass    |                                                           |

## Issues

None

## Warnings

None
