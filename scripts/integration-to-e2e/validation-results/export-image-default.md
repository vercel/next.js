# export-image-default: PASS

Clean, faithful 1-test conversion with correct build-only lifecycle.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                               |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                                                                                                          |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                                                                                                          |
| 1c  | Test titles         | pass    | "should error during next build" preserved                                                                                                                                                         |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner "production mode" flattened (placement in test/production/ makes it implicit)                                                                                      |
| 2a  | URL paths           | na      | No HTTP paths tested                                                                                                                                                                               |
| 2b  | Response checks     | na      |                                                                                                                                                                                                    |
| 2c  | FS checks           | na      | fs.remove of .next/out no longer needed — isolated test dir                                                                                                                                        |
| 2d  | Browser checks      | na      |                                                                                                                                                                                                    |
| 2e  | Build output        | pass    | `next.build()` + `next.cliOutput` replace `nextBuild` return values                                                                                                                                |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                                                    |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                                                    |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                                                                 |
| 3c  | skipStart           | pass    | Build-only, uses skipStart: true, awaits next.build()                                                                                                                                              |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                                                    |
| 3e  | Cleanup             | pass    | nextTestSetup handles; pre-build fs.remove no longer needed                                                                                                                                        |
| 4a  | Directory placement | pass    | test/production/ correct for build-only test                                                                                                                                                       |
| 4b  | Mode guards         | na      |                                                                                                                                                                                                    |
| 4c  | Turbopack guards    | na      | Build-only test; no turbopack-specific behavior                                                                                                                                                    |
| 4d  | Dedup guards        | warn    | Original wrapped in `TURBOPACK_DEV ? describe.skip : describe` — not carried over, but since the test now lives in test/production/ (only runs in build+start modes) the dedup is effectively moot |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                                                    |
| 5a  | render              | na      |                                                                                                                                                                                                    |
| 5b  | fetch               | na      |                                                                                                                                                                                                    |
| 5c  | browser             | na      |                                                                                                                                                                                                    |
| 5d  | check→retry         | na      |                                                                                                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                                                                                                                    |
| 5g  | fs operations       | pass    | Replaced appDir fs calls with isolated setup                                                                                                                                                       |
| 6a  | Fixtures exist      | pass    | pages/index.js and next.config.js present                                                                                                                                                          |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                                                                                                    |
| 7a  | No dead code        | pass    |                                                                                                                                                                                                    |
| 7b  | retry over timeout  | na      |                                                                                                                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                                                                                                                    |

## Issues

None

## Warnings

- 4d: Original had a `TURBOPACK_DEV` dedup guard around the "production mode" describe. The converted file omits it, which is fine because test/production/ only runs in build+start modes, but worth noting for auditability.
