# getinitialprops: PASS

Clean 1:1 conversion with preserved tests, assertions, fixtures, and correct dedup guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                  |
| --- | ------------------- | ------- | --------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 4, converted: 4                                             |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                             |
| 1c  | Test titles         | pass    | All preserved verbatim                                                |
| 1d  | Describe blocks     | pass    | Nested dev/prod flattened via nextTestSetup                           |
| 2a  | URL paths           | pass    | /, /normal, /blog/1, /blog/post/1 all preserved                       |
| 2b  | Response checks     | pass    | cheerio assertions preserved via render$                              |
| 2c  | FS checks           | na      |                                                                       |
| 2d  | Browser checks      | na      |                                                                       |
| 2e  | Build output        | na      |                                                                       |
| 2f  | Dynamic logic       | pass    | runTests() inlined, runs in both dev/prod via nextTestSetup           |
| 3a  | nextTestSetup       | pass    |                                                                       |
| 3b  | files param         | pass    | files: \_\_dirname                                                    |
| 3c  | skipStart           | na      | Not build-only                                                        |
| 3d  | No manual lifecycle | pass    |                                                                       |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                              |
| 4a  | Directory placement | pass    | test/e2e/ correct (runs in both modes)                                |
| 4b  | Mode guards         | na      | Same tests run in both modes                                          |
| 4c  | Turbopack guards    | na      |                                                                       |
| 4d  | Dedup guards        | pass    | TURBOPACK_DEV/BUILD dedup preserved                                   |
| 4e  | No incorrect env    | pass    | Env guards used for dedup, not skip                                   |
| 5a  | render              | pass    | renderViaHTTP + cheerio → next.render$                                |
| 5b  | fetch               | na      |                                                                       |
| 5c  | browser             | na      |                                                                       |
| 5d  | check→retry         | na      |                                                                       |
| 5e  | File class          | na      |                                                                       |
| 5f  | waitFor             | na      |                                                                       |
| 5g  | fs operations       | na      |                                                                       |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/normal.js, pages/blog/[post].js, next.config.js |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                |
| 6c  | Overrides           | na      |                                                                       |
| 7a  | No dead code        | pass    |                                                                       |
| 7b  | retry over timeout  | pass    |                                                                       |
| 7c  | async/await         | pass    |                                                                       |
| 7d  | eslint              | pass    |                                                                       |

## Issues

None

## Warnings

None
