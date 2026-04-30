# production-config: PASS

The conversion preserves all 5 original tests and their assertions; env-key tests were cleverly migrated from env-gated build-time conditionals to per-test `patchFile`+`build().catch()` with `cliOutput` assertions, and fixtures are correctly present.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5 it(), converted: 5 real it() + 2 skip placeholders                                                                                                      |
| 1b  | Assertions          | pass    | original: 6 expect(), converted: 6 expect()                                                                                                                         |
| 1c  | Test titles         | pass    | all 5 titles preserved verbatim                                                                                                                                     |
| 1d  | Describe blocks     | pass    | Production Config Usage > production mode > with generateBuildId / env                                                                                              |
| 2a  | URL paths           | pass    | only `/` via browser, preserved                                                                                                                                     |
| 2b  | Response checks     | pass    | text/html/cliOutput checks all preserved                                                                                                                            |
| 2c  | FS checks           | na      |                                                                                                                                                                     |
| 2d  | Browser checks      | pass    | webdriver → next.browser with same element/eval calls                                                                                                               |
| 2e  | Build output        | pass    | runNextCommand stderr → next.cliOutput after next.build()                                                                                                           |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                     |
| 3a  | nextTestSetup       | pass    | used in both inner describes                                                                                                                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                  |
| 3c  | skipStart           | pass    | env describe uses `skipStart: true` correctly since it runs builds itself                                                                                           |
| 3d  | No manual lifecycle | pass    | no findPort/killApp/nextBuild/nextStart                                                                                                                             |
| 3e  | Cleanup             | pass    | nextTestSetup handles cleanup                                                                                                                                       |
| 4a  | Directory placement | pass    | test/production/ matches prod-only semantics                                                                                                                        |
| 4b  | Mode guards         | pass    | uses isNextStart gates (redundant in test/production but correct)                                                                                                   |
| 4c  | Turbopack guards    | na      | original's `TURBOPACK_DEV ? skip : run` dedup is naturally handled by test/production/ directory placement                                                          |
| 4d  | Dedup guards        | warn    | original had `process.env.TURBOPACK_DEV ? describe.skip : describe`; location in test/production/ already ensures NEXT_TEST_MODE=start, so no explicit guard needed |
| 4e  | No incorrect env    | pass    | no TURBOPACK_DEV/TURBOPACK_BUILD env checks                                                                                                                         |
| 5a  | render              | na      |                                                                                                                                                                     |
| 5b  | fetch               | na      |                                                                                                                                                                     |
| 5c  | browser             | pass    | webdriver → next.browser('/')                                                                                                                                       |
| 5d  | check→retry         | na      |                                                                                                                                                                     |
| 5e  | File class          | na      |                                                                                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                                                                                     |
| 5g  | fs operations       | pass    | no direct fs; next.patchFile used for config rewrites                                                                                                               |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/\_app.js, pages/index.js, styles.css present                                                                                                  |
| 6b  | next.config.js      | pass    | present; env object intentionally removed since tests patch it in                                                                                                   |
| 6c  | Overrides           | pass    | patchFile rewrites to equivalent configs per test                                                                                                                   |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped…'); return }` blocks are unreachable in test/production/                                                                           |
| 7b  | retry over timeout  | na      | no polling needed                                                                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                                                                     |
| 7d  | eslint              | warn    | duplicate test title "skipped for non-start mode" across sibling describes could trigger duplicate-title warnings                                                   |

## Issues

None.

## Warnings

- Two `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` blocks are dead code in `test/production/` (always runs in start mode). Consider dropping them and the outer isNextStart destructuring.
- Duplicate `it('skipped for non-start mode', …)` titles across the two inner describes could trip `jest/no-identical-title`; harmless but avoidable by removing them per the previous point.
- The original's `TURBOPACK_DEV ? describe.skip : describe` dedup guard is not reproduced, but the test/production/ placement makes it unnecessary — call this out only so future reviewers know the dedup semantics weren't lost.
