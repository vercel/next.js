# edge-runtime-streaming-error: WARN

Conversion collapses two duplicate describes (dev + prod) into a single e2e test correctly, but drops the original's Turbopack skip guard for production mode.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                          |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | warn    | original: 2, converted: 1 — acceptable flattening since e2e runs both dev & start modes, but see 4c                                                                                           |
| 1b  | Assertions          | warn    | original: 8 (4 expects × 2 modes), converted: 4 — equivalent per-mode coverage                                                                                                                |
| 1c  | Test titles         | pass    | 'logs the error correctly' preserved                                                                                                                                                          |
| 1d  | Describe blocks     | pass    | Dev/prod describes appropriately flattened for e2e                                                                                                                                            |
| 2a  | URL paths           | pass    | `/api/test` preserved                                                                                                                                                                         |
| 2b  | Response checks     | pass    | status, text, stderr regex, not-contains webpack-internal preserved                                                                                                                           |
| 2c  | FS checks           | na      |                                                                                                                                                                                               |
| 2d  | Browser checks      | na      |                                                                                                                                                                                               |
| 2e  | Build output        | na      |                                                                                                                                                                                               |
| 2f  | Dynamic logic       | pass    | Same `test()` body ran for both modes in original; e2e covers both                                                                                                                            |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                            |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                                                                |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild/nextStart                                                                                                                                                     |
| 3e  | Cleanup             | pass    | nextTestSetup handles cleanup                                                                                                                                                                 |
| 4a  | Directory placement | pass    | test/e2e/ correct (ran in both modes originally)                                                                                                                                              |
| 4b  | Mode guards         | pass    | Same assertions for both modes                                                                                                                                                                |
| 4c  | Turbopack guards    | warn    | Original skipped prod describe when `process.env.TURBOPACK_DEV` is set ("setup fails for unrelated reasons"). Converted has no equivalent skip — the test will now attempt to run in that env |
| 4d  | Dedup guards        | na      |                                                                                                                                                                                               |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                                               |
| 5a  | render              | na      |                                                                                                                                                                                               |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                                                                                                                                                 |
| 5c  | browser             | na      |                                                                                                                                                                                               |
| 5d  | check→retry         | pass    | `check` replaced with `retry` + `expect(...).toMatch(...)`                                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                                                                                               |
| 5f  | waitFor             | pass    | `waitFor(200)` dropped; `retry` covers polling correctly                                                                                                                                      |
| 5g  | fs operations       | na      | `remove(.next)` dropped — handled by isolated setup                                                                                                                                           |
| 6a  | Fixtures exist      | pass    | `pages/api/test.js` present                                                                                                                                                                   |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                                                                                               |
| 7a  | No dead code        | pass    |                                                                                                                                                                                               |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                                               |
| 7c  | async/await         | pass    |                                                                                                                                                                                               |
| 7d  | eslint              | pass    |                                                                                                                                                                                               |

## Issues

None

## Warnings

- **4c**: Original's prod describe was skipped under `process.env.TURBOPACK_DEV` due to unrelated setup failure. Converted test has no skip guard, so the test may fail in that CI configuration. Consider wrapping with something like `;(process.env.IS_TURBOPACK_TEST && !process.env.TURBOPACK_BUILD ? describe.skip : describe)` or adding an `isNextStart && isTurbopack` skip inside the single test if the issue still reproduces.
- **1a/1b**: Test and assertion counts are lower than the original, but this is expected because the e2e harness re-runs the file in both dev and start modes — each mode executes the same 4 assertions the original duplicated across two describes.
