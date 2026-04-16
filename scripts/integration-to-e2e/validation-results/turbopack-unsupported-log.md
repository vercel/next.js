# turbopack-unsupported-log: WARN

Conversion preserves all 3 tests and assertions with correct Turbopack-only guard and fixture split, but the third test dropped the `check()` polling loop without replacing it with `retry()`, which could be flaky.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                      |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                                                 |
| 1b  | Assertions          | pass    | original: 8, converted: 8                                                                                 |
| 1c  | Test titles         | pass    | All 3 preserved verbatim                                                                                  |
| 1d  | Describe blocks     | pass    | Split into 3 sub-describes for fixture isolation                                                          |
| 2a  | URL paths           | pass    | `/` preserved via `next.render('/')`                                                                      |
| 2b  | Response checks     | pass    | hello world + cliOutput assertions preserved                                                              |
| 2c  | FS checks           | na      |                                                                                                           |
| 2d  | Browser checks      | na      |                                                                                                           |
| 2e  | Build output        | na      |                                                                                                           |
| 2f  | Dynamic logic       | na      |                                                                                                           |
| 3a  | nextTestSetup       | pass    | Used in each sub-describe                                                                                 |
| 3b  | files param         | pass    | `path.join(__dirname, 'fixtures/...')`                                                                    |
| 3c  | skipStart           | na      | Dev server tests                                                                                          |
| 3d  | No manual lifecycle | pass    | No launchApp/findPort/killApp                                                                             |
| 3e  | Cleanup             | pass    | No fs.writeFile/remove anymore — handled by fixtures                                                      |
| 4a  | Directory placement | pass    | test/development/ matches launchApp (dev)                                                                 |
| 4b  | Mode guards         | na      |                                                                                                           |
| 4c  | Turbopack guards    | pass    | `!IS_TURBOPACK_TEST ? describe.skip : describe` wraps outside nextTestSetup                               |
| 4d  | Dedup guards        | na      |                                                                                                           |
| 4e  | No incorrect env    | pass    |                                                                                                           |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                               |
| 5b  | fetch               | na      |                                                                                                           |
| 5c  | browser             | na      |                                                                                                           |
| 5d  | check→retry         | warn    | Third test dropped `check()` polling without `retry()` replacement — may flake if warning not yet flushed |
| 5e  | File class          | na      | Replaced by dedicated fixtures (better approach)                                                          |
| 5f  | waitFor             | na      |                                                                                                           |
| 5g  | fs operations       | pass    | Replaced with fixtures instead of fs.writeFile                                                            |
| 6a  | Fixtures exist      | pass    | 3 fixture dirs with pages/index.js (+ next.config.js where needed)                                        |
| 6b  | next.config.js      | pass    | empty-config and unsupported-config have correct configs                                                  |
| 6c  | Overrides           | na      |                                                                                                           |
| 7a  | No dead code        | pass    |                                                                                                           |
| 7b  | retry over timeout  | warn    | Same as 5d — warning assertion should use `retry()`                                                       |
| 7c  | async/await         | pass    |                                                                                                           |
| 7d  | eslint              | pass    |                                                                                                           |

## Issues

None

## Warnings

- The third test ("should warn with next.config.js with unsupported field") asserts `next.cliOutput` contains the warning synchronously. The original used `check()` to poll until the warning appeared. The converted version may flake if the warning has not been flushed to cliOutput by the time `nextTestSetup` returns. Wrap the assertion in `await retry(async () => { expect(next.cliOutput).toContain(...) })`.
