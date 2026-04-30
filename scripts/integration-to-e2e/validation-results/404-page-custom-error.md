# 404-page-custom-error: PASS

Clean conversion: single e2e file covering both dev and prod with correct dedup guards, preserved tests and assertions, and all fixture files present.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                       |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 6 unique titles (3 shared + 2 prod-only + build); converted: 5 (build subsumed by nextTestSetup) |
| 1b  | Assertions          | pass    | original: 7 unique expects; converted: 6 (build-code expect no longer needed)                              |
| 1c  | Test titles         | pass    | "should build successfully" dropped but replaced by nextTestSetup build; others preserved verbatim         |
| 1d  | Describe blocks     | pass    | nested dev/prod describes flattened into single describe with mode guards                                  |
| 2a  | URL paths           | pass    | /404, /err, / all preserved                                                                                |
| 2b  | Response checks     | pass    | status + text matches identical                                                                            |
| 2c  | FS checks           | pass    | routes-manifest.json & pages-manifest.json via next.readFile/readJSON                                      |
| 2d  | Browser checks      | na      |                                                                                                            |
| 2e  | Build output        | pass    | build success implicit via nextTestSetup                                                                   |
| 2f  | Dynamic logic       | pass    | isDev → isNextDev; prod-only tests wrapped with (isNextStart ? it : it.skip)                               |
| 3a  | nextTestSetup       | pass    |                                                                                                            |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                         |
| 3c  | skipStart           | na      | runs in both modes, needs full lifecycle                                                                   |
| 3d  | No manual lifecycle | pass    |                                                                                                            |
| 3e  | Cleanup             | pass    | handled by nextTestSetup                                                                                   |
| 4a  | Directory placement | pass    | test/e2e/ correct for dev+prod                                                                             |
| 4b  | Mode guards         | pass    | isNextDev for err text; isNextStart for manifest checks                                                    |
| 4c  | Turbopack guards    | na      |                                                                                                            |
| 4d  | Dedup guards        | pass    | TURBOPACK_DEV/TURBOPACK_BUILD dedup preserved                                                              |
| 4e  | No incorrect env    | warn    | Uses TURBOPACK_DEV/TURBOPACK_BUILD — but correctly as dedup guards, not skip logic                         |
| 5a  | render              | pass    |                                                                                                            |
| 5b  | fetch               | pass    |                                                                                                            |
| 5c  | browser             | na      |                                                                                                            |
| 5d  | check→retry         | na      |                                                                                                            |
| 5e  | File class          | na      |                                                                                                            |
| 5f  | waitFor             | na      |                                                                                                            |
| 5g  | fs operations       | pass    | fs.readJSON → next.readFile/readJSON; getPageFileFromPagesManifest → manual manifest lookup                |
| 6a  | Fixtures exist      | pass    | pages/\_error.js, pages/err.js, pages/index.js all present                                                 |
| 6b  | next.config.js      | na      | original had none                                                                                          |
| 6c  | Overrides           | na      |                                                                                                            |
| 7a  | No dead code        | pass    |                                                                                                            |
| 7b  | retry over timeout  | na      |                                                                                                            |
| 7c  | async/await         | pass    |                                                                                                            |
| 7d  | eslint              | pass    | jest/no-standalone-expect disabled at top                                                                  |

## Issues

None

## Warnings

- 4e: TURBOPACK_DEV/TURBOPACK_BUILD env vars used at module scope for dedup — this is the correct dedup pattern per criterion 4d, so noted only for context.
