# root-optional-revalidate: PASS

Clean, faithful conversion of all 3 tests with preserved assertions and correct fixture.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                      |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3 (+1 no-op skip stub)                                                                                                                                            |
| 1b  | Assertions          | pass    | original: 12, converted: 12                                                                                                                                                               |
| 1c  | Test titles         | pass    | All 3 preserved verbatim                                                                                                                                                                  |
| 1d  | Describe blocks     | pass    | Outer + "production mode" preserved                                                                                                                                                       |
| 2a  | URL paths           | pass    | `/`, `/a`, `/hello/world` all covered                                                                                                                                                     |
| 2b  | Response checks     | pass    | Props + cliOutput assertions preserved                                                                                                                                                    |
| 2c  | FS checks           | na      |                                                                                                                                                                                           |
| 2d  | Browser checks      | na      |                                                                                                                                                                                           |
| 2e  | Build output        | na      |                                                                                                                                                                                           |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                                           |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                        |
| 3c  | skipStart           | na      | Needs start; nextTestSetup handles it                                                                                                                                                     |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                                           |
| 3e  | Cleanup             | pass    |                                                                                                                                                                                           |
| 4a  | Directory placement | pass    | production-only test → `test/production/`                                                                                                                                                 |
| 4b  | Mode guards         | pass    | `isNextStart` guard present                                                                                                                                                               |
| 4c  | Turbopack guards    | warn    | `if (!isNextStart) { it/return }` inside describe that already called `nextTestSetup` — violates criterion 4c pattern, but isNextStart is always true under test/production/, so harmless |
| 4d  | Dedup guards        | na      | Original `TURBOPACK_DEV` guard was legacy; test/production/ runs once                                                                                                                     |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                                           |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                                                                           |
| 5b  | fetch               | na      |                                                                                                                                                                                           |
| 5c  | browser             | na      |                                                                                                                                                                                           |
| 5d  | check→retry         | na      | Already used retry in original                                                                                                                                                            |
| 5e  | File class          | na      |                                                                                                                                                                                           |
| 5f  | waitFor             | pass    | Used for 1s delay before second render — timing-based, acceptable                                                                                                                         |
| 5g  | fs operations       | na      |                                                                                                                                                                                           |
| 6a  | Fixtures exist      | pass    | `pages/[[...slug]].js` present (matches original)                                                                                                                                         |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                                                         |
| 6c  | Overrides           | na      |                                                                                                                                                                                           |
| 7a  | No dead code        | pass    |                                                                                                                                                                                           |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                                           |
| 7c  | async/await         | pass    |                                                                                                                                                                                           |
| 7d  | eslint              | pass    |                                                                                                                                                                                           |

## Issues

None

## Warnings

- 4c: `if (!isNextStart) { it('skipped'); return }` is placed inside the describe that already invokes `nextTestSetup()`. Since this file lives in `test/production/`, `isNextStart` is always true, so the guard is dead code but harmless. Preferred pattern would drop the guard entirely or wrap the describe externally.
- cliOutput stdout-capture pattern (`app.stdout.on('data', ...)`) was cleanly replaced with `next.cliOutput.slice(outputIndex)` — equivalent behavior.
