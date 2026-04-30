# handles-export-errors: PASS

Clean 1:1 conversion of a build-only test; fixtures and assertions fully preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                           |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                                      |
| 1b  | Assertions          | pass    | original: 11, converted: 11                                                                                                    |
| 1c  | Test titles         | pass    | "Does not crash workers" preserved                                                                                             |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner `production mode` describe is effectively replaced by placement in `test/production/`          |
| 2a  | URL paths           | na      | Build-only test                                                                                                                |
| 2b  | Response checks     | na      |                                                                                                                                |
| 2c  | FS checks           | na      |                                                                                                                                |
| 2d  | Browser checks      | na      |                                                                                                                                |
| 2e  | Build output        | pass    | `stdout + stderr` collapsed into `cliOutput`; same patterns asserted                                                           |
| 2f  | Dynamic logic       | na      |                                                                                                                                |
| 3a  | nextTestSetup       | pass    | Imported from `e2e-utils`                                                                                                      |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                             |
| 3c  | skipStart           | pass    | `skipStart: true` with `await next.build()`                                                                                    |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`findPort` usage                                                                                                |
| 3e  | Cleanup             | na      | nextTestSetup handles                                                                                                          |
| 4a  | Directory placement | pass    | `test/production/` is correct for build-only                                                                                   |
| 4b  | Mode guards         | na      |                                                                                                                                |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV` skip was a dedup guard; redundant now that the test lives in `test/production/` (dev modes don't run) |
| 4d  | Dedup guards        | na      | Obviated by directory placement                                                                                                |
| 4e  | No incorrect env    | pass    |                                                                                                                                |
| 5a  | render              | na      |                                                                                                                                |
| 5b  | fetch               | na      |                                                                                                                                |
| 5c  | browser             | na      |                                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                                |
| 5e  | File class          | na      |                                                                                                                                |
| 5f  | waitFor             | na      |                                                                                                                                |
| 5g  | fs operations       | na      |                                                                                                                                |
| 6a  | Fixtures exist      | pass    | `pages/` (index, page-1…page-13, blog/[slug], custom-error) and `next.config.mjs` present                                      |
| 6b  | next.config.js      | pass    | `next.config.mjs` mirrored                                                                                                     |
| 6c  | Overrides           | na      |                                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                                |
| 7b  | retry over timeout  | pass    |                                                                                                                                |
| 7c  | async/await         | pass    |                                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                                |

## Issues

None

## Warnings

None
