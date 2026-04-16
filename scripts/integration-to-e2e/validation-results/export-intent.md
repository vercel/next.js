# export-intent: PASS

Clean conversion that preserves all assertions; some test granularity was reduced by merging "should build" + "should have expected outputs" tests, but all behavior and assertions are preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                  |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | warn    | original: 11, converted: 7 — build+assertion test pairs merged for Default/Custom/Custom-Out/No-Export (first case); Bad-Export kept separate correctly                               |
| 1b  | Assertions          | pass    | original: 13, converted: 13                                                                                                                                                           |
| 1c  | Test titles         | warn    | Titles reworded after merging but semantic coverage preserved                                                                                                                         |
| 1d  | Describe blocks     | pass    | 5 describe blocks preserved (Default/Custom/Custom Out/Bad/No Export); outer TURBOPACK_DEV wrapper removed (was a CI dedup for integration tests, not applicable in test/production/) |
| 2a  | URL paths           | na      | No HTTP access in original                                                                                                                                                            |
| 2b  | Response checks     | na      |                                                                                                                                                                                       |
| 2c  | FS checks           | pass    | `fs.readFileSync(join(distDir, ...))` → `next.readFile('.next/...')`; `toThrow(/ENOENT/)` → `next.hasFile(...)` returns false                                                         |
| 2d  | Browser checks      | na      |                                                                                                                                                                                       |
| 2e  | Build output        | pass    | `nextBuild(...)` → `next.build()`; stderr match → `next.cliOutput.toMatch('.getInitialProps()')`; `result.code` → `exitCode`                                                          |
| 2f  | Dynamic logic       | na      | No runTests helper                                                                                                                                                                    |
| 3a  | nextTestSetup       | pass    | Used for all 5 describes                                                                                                                                                              |
| 3b  | files param         | pass    | `path.join(__dirname, 'fixtures/...')`                                                                                                                                                |
| 3c  | skipStart           | pass    | Build-only test; `skipStart: true` + explicit `await next.build()`                                                                                                                    |
| 3d  | No manual lifecycle | pass    | No manual lifecycle helpers                                                                                                                                                           |
| 3e  | Cleanup             | pass    | Isolated test dir handles cleanup; no `remove(distDir)` needed                                                                                                                        |
| 4a  | Directory placement | pass    | test/production/ correct for build-only production test                                                                                                                               |
| 4b  | Mode guards         | na      | No dev/prod conditional logic                                                                                                                                                         |
| 4c  | Turbopack guards    | pass    | Original's `TURBOPACK_DEV` guard was integration-CI dedup and does not apply in test/production/ (will only run in start mode)                                                        |
| 4d  | Dedup guards        | na      | Not applicable                                                                                                                                                                        |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD usage                                                                                                                                                          |
| 5a  | render              | na      |                                                                                                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                                                                                       |
| 5c  | browser             | na      |                                                                                                                                                                                       |
| 5d  | check→retry         | na      |                                                                                                                                                                                       |
| 5e  | File class          | na      |                                                                                                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                                                                                       |
| 5g  | fs operations       | pass    | Direct `fs.readFileSync` replaced with `next.readFile`/`next.hasFile`                                                                                                                 |
| 6a  | Fixtures exist      | pass    | All 5 fixture dirs present with pages/index.js; next.config.js present for 4 (no-export intentionally omits, same as original)                                                        |
| 6b  | next.config.js      | pass    | Preserved where present                                                                                                                                                               |
| 6c  | Overrides           | na      |                                                                                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                                                                                       |
| 7b  | retry over timeout  | na      | No async polling needed                                                                                                                                                               |
| 7c  | async/await         | pass    |                                                                                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                                                                                       |

## Issues

None

## Warnings

- Test count reduced from 11 to 7 because build+output-assertion pairs were merged into single tests for Default/Custom/Custom-Out and for No-Export's first test. All assertions are preserved (13 = 13), so coverage is intact, but granularity is lost — a build-step failure will now also mark the assertion test as failed in the same `it`.
