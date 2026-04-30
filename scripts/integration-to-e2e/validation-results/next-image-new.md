# next-image-new: WARN

Conversion is comprehensive and faithful, with proper API migrations and mode guards. One minor issue: `base-path.test.ts:129` retains a `setTimeout` that should be `retry()`.

## Criteria

| #   | Criterion                    | Verdict | Note                                                                                       |
| --- | ---------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| 1a  | Test count                   | pass    | original ~234, converted ~241 (minor consolidations: trailing-slash 2→1, asset-prefix 4→3) |
| 1b  | Assertion preservation       | pass    | Converted >= original                                                                      |
| 1c  | Test title preservation      | pass    | All unique titles preserved                                                                |
| 1d  | Describe block structure     | pass    | `runTests(mode)` flattened with `isNextDev` guards                                         |
| 2a  | URL paths accessed           | pass    |                                                                                            |
| 2b  | Response checks              | pass    |                                                                                            |
| 2c  | FS checks use next helpers   | pass    | minor `existsSync` in default.test.ts                                                      |
| 2d  | Browser interactions         | pass    |                                                                                            |
| 2e  | Build output checks          | pass    |                                                                                            |
| 2f  | runTests helpers preserved   | pass    |                                                                                            |
| 3a  | nextTestSetup usage          | pass    |                                                                                            |
| 3b  | files: \_\_dirname           | pass    |                                                                                            |
| 3c  | skipStart when build-only    | pass    | typescript.test.ts                                                                         |
| 3d  | No manual lifecycle          | pass    |                                                                                            |
| 3e  | Cleanup                      | pass    |                                                                                            |
| 4a  | Directory placement          | pass    |                                                                                            |
| 4b  | Mode guards                  | pass    |                                                                                            |
| 4c  | Turbopack skip outside setup | pass    |                                                                                            |
| 4d  | Dedup guards                 | pass    |                                                                                            |
| 4e  | No incorrect env guards      | pass    |                                                                                            |
| 5a  | render                       | pass    |                                                                                            |
| 5b  | fetch                        | pass    |                                                                                            |
| 5c  | browser                      | pass    |                                                                                            |
| 5d  | check→retry                  | warn    | base-path.test.ts uses setTimeout                                                          |
| 5e  | File class                   | pass    |                                                                                            |
| 5f  | waitFor→retry                | warn    | base-path.test.ts:129                                                                      |
| 5g  | fs ops                       | pass    |                                                                                            |
| 6a  | Fixture files exist          | pass    | All 21 dirs verified                                                                       |
| 6b  | next.config.js               | pass    |                                                                                            |
| 6c  | Overrides equivalent         | pass    |                                                                                            |
| 7a  | No dead code                 | pass    |                                                                                            |
| 7b  | retry over setTimeout        | warn    | base-path.test.ts:129                                                                      |
| 7c  | async/await                  | pass    |                                                                                            |
| 7d  | eslint                       | pass    |                                                                                            |

## Issues

None.

## Warnings

- `test/e2e/next-image-new/base-path/base-path.test.ts:129` uses `await new Promise((resolve) => setTimeout(resolve, 1000))` — should use `retry()`.
- `trailing-slash` merged 2 identical dev/prod tests into 1 (acceptable).
- `asset-prefix` deduped identical "no deprecation warning" test 4→3 (acceptable).
- `default.test.ts` uses `existsSync` via `join(appDir, ...)` — `next.hasFile` would be more idiomatic.
- `typescript.test.ts` uses no-op `it()` placeholders across two describe blocks — functional but slightly inelegant.
