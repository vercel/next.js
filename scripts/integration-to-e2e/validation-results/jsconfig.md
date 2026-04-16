# jsconfig: PASS

Clean 1:1 conversion of the jsconfig integration suite into a production-only e2e test using `nextTestSetup` with `skipStart`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                                                             |
| 1b  | Assertions          | pass    | original: 6, converted: 8 (added exitCode assertions)                                                                                                 |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                                                        |
| 1d  | Describe blocks     | pass    | Outer `jsconfig.json` preserved; inner `production mode` dropped (it was only a TURBOPACK_DEV skip wrapper, now handled by test/production placement) |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                                      |
| 2b  | Response checks     | na      | Build-only                                                                                                                                            |
| 2c  | FS checks           | pass    | `fs.readFile`/`fs.writeFile` on appDir → `next.readFile`/`next.patchFile`                                                                             |
| 2d  | Browser checks      | na      |                                                                                                                                                       |
| 2e  | Build output        | pass    | `nextBuild().stdout/stderr` → `next.build()` + `next.cliOutput`; added exitCode checks                                                                |
| 2f  | Dynamic logic       | pass    | `IS_TURBOPACK_TEST` branch preserved via `isTurbopack` from setup                                                                                     |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                       |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                    |
| 3c  | skipStart           | pass    | Build-only test, uses `skipStart: true` and explicit `next.build()`                                                                                   |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`launchApp` imports                                                                                                                    |
| 3e  | Cleanup             | pass    | `finally` restores jsconfig.json via `next.patchFile`                                                                                                 |
| 4a  | Directory placement | pass    | Build-only → `test/production/` is appropriate                                                                                                        |
| 4b  | Mode guards         | pass    | Uses `isTurbopack` correctly                                                                                                                          |
| 4c  | Turbopack guards    | pass    | Original's `TURBOPACK_DEV` skip is handled by placement in `test/production/` (not run in dev jobs)                                                   |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV` skip was a dev-mode dedup; production placement subsumes it                                                                  |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack` from setup                                                                                                                         |
| 5a  | render              | na      |                                                                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                                                       |
| 5c  | browser             | na      |                                                                                                                                                       |
| 5d  | check→retry         | na      |                                                                                                                                                       |
| 5e  | File class          | pass    | Uses `next.patchFile()` for temporary file mutation                                                                                                   |
| 5f  | waitFor             | na      |                                                                                                                                                       |
| 5g  | fs operations       | pass    | Replaced with `next.readFile`/`next.patchFile`                                                                                                        |
| 6a  | Fixtures exist      | pass    | `jsconfig.json`, `pages/hello.js` present                                                                                                             |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                     |
| 6c  | Overrides           | na      |                                                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                                                                                       |
| 7c  | async/await         | pass    | Fixed the original's `await await nextBuild` typo                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                                                                       |

## Issues

None

## Warnings

None
