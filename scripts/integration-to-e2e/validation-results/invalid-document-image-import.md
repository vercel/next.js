# invalid-document-image-import: PASS

Clean, faithful conversion of a build-only test to `nextTestSetup` with `skipStart: true`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                          |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                     |
| 1b  | Assertions          | pass    | original: 9, converted: 9                                                                                     |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                |
| 1d  | Describe blocks     | pass    | Inner "production mode" describe flattened (test is in test/production/)                                      |
| 2a  | URL paths           | na      | No URL access                                                                                                 |
| 2b  | Response checks     | na      |                                                                                                               |
| 2c  | FS checks           | na      |                                                                                                               |
| 2d  | Browser checks      | na      |                                                                                                               |
| 2e  | Build output        | pass    | Uses `next.build()` returning `{exitCode, stderr}`                                                            |
| 2f  | Dynamic logic       | na      |                                                                                                               |
| 3a  | nextTestSetup       | pass    |                                                                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                                                                            |
| 3c  | skipStart           | pass    | `skipStart: true` for build-only test                                                                         |
| 3d  | No manual lifecycle | pass    |                                                                                                               |
| 3e  | Cleanup             | pass    | `nextConfig.restore()` no longer needed (isolated dir)                                                        |
| 4a  | Directory placement | pass    | test/production/ correct                                                                                      |
| 4b  | Mode guards         | na      |                                                                                                               |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST ? describe.skip` wraps outside setup correctly                                             |
| 4d  | Dedup guards        | warn    | Original inner `TURBOPACK_DEV ? describe.skip` not copied, but outer IS_TURBOPACK_TEST skip already covers it |
| 4e  | No incorrect env    | pass    |                                                                                                               |
| 5a  | render              | na      |                                                                                                               |
| 5b  | fetch               | na      |                                                                                                               |
| 5c  | browser             | na      |                                                                                                               |
| 5d  | check→retry         | na      |                                                                                                               |
| 5e  | File class          | pass    | Replaced `new File().write()` with `next.patchFile()`                                                         |
| 5f  | waitFor             | na      |                                                                                                               |
| 5g  | fs operations       | pass    | No direct fs                                                                                                  |
| 6a  | Fixtures exist      | pass    | pages/\_document.js, pages/index.js, public/test.jpg, next.config.js all present                              |
| 6b  | next.config.js      | pass    | Present with same `/* replaceme */` placeholder                                                               |
| 6c  | Overrides           | na      |                                                                                                               |
| 7a  | No dead code        | pass    |                                                                                                               |
| 7b  | retry over timeout  | na      |                                                                                                               |
| 7c  | async/await         | pass    |                                                                                                               |
| 7d  | eslint              | pass    |                                                                                                               |

## Issues

None

## Warnings

- Original had an inner `TURBOPACK_DEV ? describe.skip` dedup guard around the production-mode block. It is not copied, but the outer `IS_TURBOPACK_TEST` skip in the converted test already disables the whole suite under any Turbopack CI variant, so behavior is equivalent or stricter.
