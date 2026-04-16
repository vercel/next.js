# edge-runtime-with-node.js-apis: WARN

The conversion preserves test structure, fixtures, and coverage; one minor assertion was dropped in the dev-mode "does not throw" path.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                   |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | Both expand to 88 test cases (2 routes × (2+20 dev + 20+2 prod))                       |
| 1b  | Assertions          | warn    | ~4 assertions dropped (no `expect(output).not.toInclude(...)` in dev "does not throw") |
| 1c  | Test titles         | pass    | All 4 titles preserved verbatim                                                        |
| 1d  | Describe blocks     | pass    | `development mode` / `production mode` flattened into `if (isNextDev)` — acceptable    |
| 2a  | URL paths           | pass    | `/${useCase}` and `/api/route?case=...` both exercised                                 |
| 2b  | Response checks     | pass    | status codes + cliOutput content checks preserved                                      |
| 2c  | FS checks           | na      |                                                                                        |
| 2d  | Browser checks      | na      |                                                                                        |
| 2e  | Build output        | pass    | `next.cliOutput` used instead of `buildResult.stderr`                                  |
| 2f  | Dynamic logic       | pass    | Dev vs prod split mapped to `isNextDev`                                                |
| 3a  | nextTestSetup       | pass    | Imported from `e2e-utils`                                                              |
| 3b  | files param         | pass    | `files: __dirname`                                                                     |
| 3c  | skipStart           | na      | Prod path still needs start for cliOutput access                                       |
| 3d  | No manual lifecycle | pass    | No `launchApp`/`nextBuild`/`killApp`                                                   |
| 3e  | Cleanup             | pass    | nextTestSetup handles                                                                  |
| 4a  | Directory placement | pass    | `test/e2e/` correct since both dev & prod run                                          |
| 4b  | Mode guards         | pass    | `isNextDev` branch matches original                                                    |
| 4c  | Turbopack guards    | pass    | N/A — original guards were dev/start gating, now handled by `isNextDev`                |
| 4d  | Dedup guards        | pass    | Handled via nextTestSetup mode gating                                                  |
| 4e  | No incorrect env    | pass    | Uses `isNextDev` from setup                                                            |
| 5a  | render              | na      |                                                                                        |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                                          |
| 5c  | browser             | na      |                                                                                        |
| 5d  | check→retry         | pass    | `waitFor(500)` replaced with `retry()` loop                                            |
| 5e  | File class          | na      |                                                                                        |
| 5f  | waitFor             | pass    | Removed in favor of `retry()`                                                          |
| 5g  | fs operations       | na      |                                                                                        |
| 6a  | Fixtures exist      | pass    | `pages/`, `lib/`, `middleware.js` all present and identical to original                |
| 6b  | next.config.js      | na      | Original had none                                                                      |
| 6c  | Overrides           | na      |                                                                                        |
| 7a  | No dead code        | pass    |                                                                                        |
| 7b  | retry over timeout  | pass    |                                                                                        |
| 7c  | async/await         | pass    |                                                                                        |
| 7d  | eslint              | pass    |                                                                                        |

## Issues

None.

## Warnings

- Dev-mode "does not throw on using $api" drops the original `expect(output).not.toInclude(...)` check. The converted test only asserts status 200 — it no longer verifies absence of the Node.js API warning for `process.arch` / `process.version`. Minor coverage reduction but title is still accurate.
