# build-warnings: PASS

Clean conversion with full test coverage, correct lifecycle, and proper turbopack guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                              |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 6, converted: 6                                                                                                                                         |
| 1b  | Assertions          | pass    | original: 7, converted: 7                                                                                                                                         |
| 1c  | Test titles         | pass    | All preserved ("shown"→"show" typo fix)                                                                                                                           |
| 1d  | Describe blocks     | pass    | Outer "Build warnings" preserved; inner structure expanded logically (minification + cache groups)                                                                |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                                                  |
| 2b  | Response checks     | na      | No HTTP responses                                                                                                                                                 |
| 2c  | FS checks           | pass    | `new File` replaced with `next.patchFile`                                                                                                                         |
| 2d  | Browser checks      | na      |                                                                                                                                                                   |
| 2e  | Build output        | pass    | `nextBuild().stderr/stdout` → `next.cliOutput.slice(start)` after `next.build()`                                                                                  |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                   |
| 3a  | nextTestSetup       | pass    | Used correctly                                                                                                                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                |
| 3c  | skipStart           | pass    | Build-only — uses `skipStart: true` + `await next.build()`                                                                                                        |
| 3d  | No manual lifecycle | pass    | No nextBuild/launchApp imports                                                                                                                                    |
| 3e  | Cleanup             | pass    | Each env-specific test uses a separate describe with fresh setup; no manual restore needed                                                                        |
| 4a  | Directory placement | pass    | `test/production/` correct for build-only tests                                                                                                                   |
| 4b  | Mode guards         | na      | Prod-only                                                                                                                                                         |
| 4c  | Turbopack guards    | pass    | `isTurbopack ? it.skip : it` — webpack-specific tests correctly skipped. Original's outer `TURBOPACK_DEV` guard is moot since this lives under `test/production/` |
| 4d  | Dedup guards        | na      |                                                                                                                                                                   |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack` from setup                                                                                                                                     |
| 5a  | render              | na      |                                                                                                                                                                   |
| 5b  | fetch               | na      |                                                                                                                                                                   |
| 5c  | browser             | na      |                                                                                                                                                                   |
| 5d  | check→retry         | na      |                                                                                                                                                                   |
| 5e  | File class          | pass    | `new File().replace/restore` → `next.patchFile` with fresh content per test                                                                                       |
| 5f  | waitFor             | pass    | `waitFor(500)` dropped — was unnecessary timing hack                                                                                                              |
| 5g  | fs operations       | pass    | `remove(join(appDir, '.next'))` dropped — isolated test dir gets fresh build each describe                                                                        |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `next.config.js` present                                                                                                                        |
| 6b  | next.config.js      | pass    | Identical to original                                                                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                                                                   |
| 7a  | No dead code        | pass    |                                                                                                                                                                   |
| 7b  | retry over timeout  | pass    | No setTimeout usage                                                                                                                                               |
| 7c  | async/await         | pass    |                                                                                                                                                                   |
| 7d  | eslint              | pass    | `jest/no-standalone-expect` disables preserved                                                                                                                    |

## Issues

None

## Warnings

None
