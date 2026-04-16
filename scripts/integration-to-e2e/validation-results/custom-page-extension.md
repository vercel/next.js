# custom-page-extension: PASS

Clean conversion — both tests preserved with proper dedup guards and fixture files in place.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                              |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                         |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                         |
| 1c  | Test titles         | pass    | Both preserved verbatim                                                                           |
| 1d  | Describe blocks     | pass    | Dev/prod describe blocks flattened into isNextDev/isNextStart via nextTestSetup                   |
| 2a  | URL paths           | pass    | /blog and /blog/nextjs                                                                            |
| 2b  | Response checks     | pass    | toContain assertions preserved                                                                    |
| 2c  | FS checks           | na      |                                                                                                   |
| 2d  | Browser checks      | na      |                                                                                                   |
| 2e  | Build output        | na      |                                                                                                   |
| 2f  | Dynamic logic       | pass    | runTests() helper inlined, same tests run in both modes                                           |
| 3a  | nextTestSetup       | pass    |                                                                                                   |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                |
| 3c  | skipStart           | na      | Not build-only                                                                                    |
| 3d  | No manual lifecycle | pass    |                                                                                                   |
| 3e  | Cleanup             | pass    |                                                                                                   |
| 4a  | Directory placement | pass    | test/e2e/ for dev+prod                                                                            |
| 4b  | Mode guards         | na      | Same tests in both modes                                                                          |
| 4c  | Turbopack guards    | pass    | Top-level describe wrap, outside nextTestSetup                                                    |
| 4d  | Dedup guards        | pass    | `(isNextDev && TURBOPACK_BUILD) \|\| (isNextStart && TURBOPACK_DEV)` — matches original semantics |
| 4e  | No incorrect env    | pass    | TURBOPACK_DEV/BUILD combined with isNextDev/isNextStart is the correct dedup pattern              |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                       |
| 5b  | fetch               | na      |                                                                                                   |
| 5c  | browser             | na      |                                                                                                   |
| 5d  | check→retry         | na      |                                                                                                   |
| 5e  | File class          | na      |                                                                                                   |
| 5f  | waitFor             | na      |                                                                                                   |
| 5g  | fs operations       | na      |                                                                                                   |
| 6a  | Fixtures exist      | pass    | next.config.js + pages/blog/index.page.js + pages/blog/[pid].page.js                              |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                            |
| 6c  | Overrides           | na      |                                                                                                   |
| 7a  | No dead code        | pass    |                                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                   |
| 7d  | eslint              | pass    |                                                                                                   |

## Issues

None

## Warnings

None
