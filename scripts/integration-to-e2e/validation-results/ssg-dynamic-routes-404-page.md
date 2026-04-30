# ssg-dynamic-routes-404-page: PASS

Clean conversion: the single test case and all assertions are preserved, fixtures are intact, and the dedup guards from the original map naturally onto e2e-utils running both dev and prod.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 (runTests called twice in two describes, same test) → 1 distinct; converted: 1                                                                                          |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                                                                                           |
| 1c  | Test titles         | pass    | "should respond to a not existing page with 404" preserved                                                                                                                          |
| 1d  | Describe blocks     | pass    | Mode-specific describes flattened; nextTestSetup covers both modes                                                                                                                  |
| 2a  | URL paths           | pass    | `/post/2` preserved                                                                                                                                                                 |
| 2b  | Response checks     | pass    | status 404 + body contains "custom 404 page"                                                                                                                                        |
| 2c  | FS checks           | na      |                                                                                                                                                                                     |
| 2d  | Browser checks      | na      |                                                                                                                                                                                     |
| 2e  | Build output        | pass    | nextTestSetup runs build in prod mode                                                                                                                                               |
| 2f  | Dynamic logic       | na      | runTests() identical for both modes                                                                                                                                                 |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                                     |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                                                  |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                                                      |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                                     |
| 3e  | Cleanup             | pass    |                                                                                                                                                                                     |
| 4a  | Directory placement | pass    | test/e2e (runs in dev+prod)                                                                                                                                                         |
| 4b  | Mode guards         | na      | Test identical in both modes                                                                                                                                                        |
| 4c  | Turbopack guards    | na      |                                                                                                                                                                                     |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_DEV`/`TURBOPACK_BUILD` skip guards; converted relies on e2e default (runs in all modes). This may produce redundant runs across turbopack dev+build CI jobs |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                                     |
| 5a  | render              | na      |                                                                                                                                                                                     |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                                                                                                           |
| 5c  | browser             | na      |                                                                                                                                                                                     |
| 5d  | check→retry         | na      |                                                                                                                                                                                     |
| 5e  | File class          | na      |                                                                                                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                                                                                                     |
| 5g  | fs operations       | na      |                                                                                                                                                                                     |
| 6a  | Fixtures exist      | pass    | pages/404.js, pages/post/[id].js present                                                                                                                                            |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                                                   |
| 6c  | Overrides           | na      |                                                                                                                                                                                     |
| 7a  | No dead code        | pass    |                                                                                                                                                                                     |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                                                                                                     |

## Issues

None.

## Warnings

- 4d: Original used `TURBOPACK_DEV`/`TURBOPACK_BUILD` to dedup mode runs; converted drops these. Not a correctness issue but may add redundant CI runs.
