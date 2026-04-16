# json-serialize-original-error: PASS

Clean, faithful conversion of a single build-failure assertion; all behavior preserved with proper `skipStart` + `next.build()` pattern.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 (+1 no-op placeholder)                                                    |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                           |
| 1c  | Test titles         | pass    | "should fail with original error" preserved                                                         |
| 1d  | Describe blocks     | pass    | `JSON Serialization` > `production mode` preserved                                                  |
| 2a  | URL paths           | na      | No HTTP requests                                                                                    |
| 2b  | Response checks     | na      |                                                                                                     |
| 2c  | FS checks           | na      |                                                                                                     |
| 2d  | Browser checks      | na      |                                                                                                     |
| 2e  | Build output        | pass    | `next.build()` + `next.cliOutput` replaces `nextBuild` + stderr                                     |
| 2f  | Dynamic logic       | na      |                                                                                                     |
| 3a  | nextTestSetup       | pass    |                                                                                                     |
| 3b  | files param         | pass    | `files: __dirname`                                                                                  |
| 3c  | skipStart           | pass    | Build-only test, `skipStart: true` + explicit `next.build()`                                        |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`launchApp`/etc.                                                                     |
| 3e  | Cleanup             | pass    | nextTestSetup handles it                                                                            |
| 4a  | Directory placement | pass    | `test/production/` correct (prod-only)                                                              |
| 4b  | Mode guards         | pass    | `isNextStart` guard present                                                                         |
| 4c  | Turbopack guards    | na      | Original's `TURBOPACK_DEV` skip was a dev-mode dedup; placement in `test/production/` makes it moot |
| 4d  | Dedup guards        | na      |                                                                                                     |
| 4e  | No incorrect env    | pass    |                                                                                                     |
| 5a  | render              | na      |                                                                                                     |
| 5b  | fetch               | na      |                                                                                                     |
| 5c  | browser             | na      |                                                                                                     |
| 5d  | check→retry         | na      |                                                                                                     |
| 5e  | File class          | na      |                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                     |
| 5g  | fs operations       | na      |                                                                                                     |
| 6a  | Fixtures exist      | pass    | `pages/bigint.js` present                                                                           |
| 6b  | next.config.js      | na      | Neither original nor converted has one                                                              |
| 6c  | Overrides           | na      |                                                                                                     |
| 7a  | No dead code        | pass    |                                                                                                     |
| 7b  | retry over timeout  | na      |                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                     |

## Issues

None

## Warnings

None
