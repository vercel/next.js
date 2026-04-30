# export-404: PASS

Clean conversion: all 3 tests, titles, assertions, and fixture files preserved with correct `skipStart: true` lifecycle for build-only tests.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                       |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                                  |
| 1b  | Assertions          | pass    | original: 7, converted: 7                                                                  |
| 1c  | Test titles         | pass    | All 3 preserved verbatim                                                                   |
| 1d  | Describe blocks     | pass    | Inner `production mode` describe flattened (appropriate since test is in test/production/) |
| 2a  | URL paths           | na      | No HTTP requests                                                                           |
| 2b  | Response checks     | na      |                                                                                            |
| 2c  | FS checks           | pass    | `fs.access/stat` → `next.hasFile()`, `fs.readFile` → `next.readFile()`                     |
| 2d  | Browser checks      | na      |                                                                                            |
| 2e  | Build output        | pass    | `nextBuild(appDir)` → `next.build()`                                                       |
| 2f  | Dynamic logic       | na      |                                                                                            |
| 3a  | nextTestSetup       | pass    | Used in both describes                                                                     |
| 3b  | files param         | pass    | `files: __dirname`                                                                         |
| 3c  | skipStart           | pass    | `skipStart: true` with `await next.build()`                                                |
| 3d  | No manual lifecycle | pass    | No nextBuild/launchApp imports                                                             |
| 3e  | Cleanup             | pass    | Second test restores next.config.js back to `trailingSlash: false` via patchFile           |
| 4a  | Directory placement | pass    | Prod-only test correctly in test/production/                                               |
| 4b  | Mode guards         | na      |                                                                                            |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV ? describe.skip` not needed since placed in test/production/       |
| 4d  | Dedup guards        | na      |                                                                                            |
| 4e  | No incorrect env    | pass    |                                                                                            |
| 5a  | render              | na      |                                                                                            |
| 5b  | fetch               | na      |                                                                                            |
| 5c  | browser             | na      |                                                                                            |
| 5d  | check→retry         | na      |                                                                                            |
| 5e  | File class          | pass    | `new File(nextConfig).replace/restore` → `next.patchFile()`                                |
| 5f  | waitFor             | na      |                                                                                            |
| 5g  | fs operations       | pass    | All converted to `next.*` helpers                                                          |
| 6a  | Fixtures exist      | pass    | pages/404.js, next.config.js present                                                       |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                     |
| 6c  | Overrides           | na      |                                                                                            |
| 7a  | No dead code        | pass    |                                                                                            |
| 7b  | retry over timeout  | na      | No polling needed                                                                          |
| 7c  | async/await         | pass    |                                                                                            |
| 7d  | eslint              | pass    |                                                                                            |

## Issues

None

## Warnings

None
