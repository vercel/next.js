# errors-on-output-to-public: PASS

Clean conversion of a build-only suite; all tests, assertions, and error-matching regexes preserved, and the original `TURBOPACK_DEV` skip is made moot by placement in `test/production/`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                           |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                      |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                      |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                 |
| 1d  | Describe blocks     | pass    | Inner "production mode" describe flattened; acceptable since suite is now in test/production/                  |
| 2a  | URL paths           | na      | No HTTP requests in original                                                                                   |
| 2b  | Response checks     | na      |                                                                                                                |
| 2c  | FS checks           | pass    | Uses `next.patchFile` instead of raw `fs.writeFile` on appDir                                                  |
| 2d  | Browser checks      | na      |                                                                                                                |
| 2e  | Build output        | pass    | `next.build()` + `next.cliOutput` replaces `nextBuild(...).stdout + stderr`                                    |
| 2f  | Dynamic logic       | na      |                                                                                                                |
| 3a  | nextTestSetup       | pass    |                                                                                                                |
| 3b  | files param         | pass    | `files: __dirname`                                                                                             |
| 3c  | skipStart           | pass    | `skipStart: true` + explicit `next.build()`                                                                    |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`findPort`/`killApp`                                                                            |
| 3e  | Cleanup             | pass    | `afterEach` removing next.config.js no longer needed — isolated test dir + `patchFile` overwrites on each test |
| 4a  | Directory placement | pass    | test/production/ matches original's prod-only scope                                                            |
| 4b  | Mode guards         | na      | Prod-only, no dev branch                                                                                       |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV` skip not needed; production dir doesn't run in Turbopack dev matrix                   |
| 4d  | Dedup guards        | na      |                                                                                                                |
| 4e  | No incorrect env    | pass    |                                                                                                                |
| 5a  | render              | na      |                                                                                                                |
| 5b  | fetch               | na      |                                                                                                                |
| 5c  | browser             | na      |                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                |
| 5e  | File class          | na      |                                                                                                                |
| 5f  | waitFor             | na      |                                                                                                                |
| 5g  | fs operations       | pass    | `fs.writeFile(nextConfig, ...)` → `next.patchFile('next.config.js', ...)`                                      |
| 6a  | Fixtures exist      | pass    | pages/index.js present                                                                                         |
| 6b  | next.config.js      | pass    | Created per-test via `patchFile` (matches original pattern)                                                    |
| 6c  | Overrides           | na      |                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                |
| 7b  | retry over timeout  | na      |                                                                                                                |
| 7c  | async/await         | pass    |                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                |

## Issues

None

## Warnings

None
