# typescript-only-remove-type-imports: PASS

Clean conversion that preserves both test cases and correctly wraps the Turbopack skip outside `nextTestSetup`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                               |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 unique (runTests called 2x), converted: 2                                              |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                          |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                     |
| 1d  | Describe blocks     | pass    | Outer describe preserved; mode sub-describes collapsed into nextTestSetup                          |
| 2a  | URL paths           | pass    | `/normal` and `/` both covered                                                                     |
| 2b  | Response checks     | pass    | `toContain` assertions preserved                                                                   |
| 2c  | FS checks           | na      | None                                                                                               |
| 2d  | Browser checks      | na      | None                                                                                               |
| 2e  | Build output        | na      | None                                                                                               |
| 2f  | Dynamic logic       | pass    | runTests() body inlined; e2e runs both dev+start                                                   |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                              |
| 3b  | files param         | pass    | `files: __dirname`                                                                                 |
| 3c  | skipStart           | na      | Not build-only                                                                                     |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp/nextBuild                                                            |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                           |
| 4a  | Directory placement | pass    | `test/e2e/` correct (runs dev+prod)                                                                |
| 4b  | Mode guards         | na      | Same behavior both modes                                                                           |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST ? describe.skip` wraps outside nextTestSetup                                    |
| 4d  | Dedup guards        | na      | Original TURBOPACK_DEV/BUILD guards were inside turbopack-skipped block — redundant; safe to drop  |
| 4e  | No incorrect env    | pass    | Only IS_TURBOPACK_TEST used                                                                        |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                    |
| 5b  | fetch               | na      |                                                                                                    |
| 5c  | browser             | na      |                                                                                                    |
| 5d  | check→retry         | na      |                                                                                                    |
| 5e  | File class          | na      |                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                    |
| 5g  | fs operations       | na      |                                                                                                    |
| 6a  | Fixtures exist      | pass    | pages/index.tsx, pages/normal.tsx, User.ts, UserStatistics.ts, tsconfig.json, .babelrc all present |
| 6b  | next.config.js      | na      | Original has none                                                                                  |
| 6c  | Overrides           | na      |                                                                                                    |
| 7a  | No dead code        | pass    |                                                                                                    |
| 7b  | retry over timeout  | na      |                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                    |

## Issues

None

## Warnings

None
