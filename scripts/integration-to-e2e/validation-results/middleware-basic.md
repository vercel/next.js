# middleware-basic: PASS

Clean conversion — single test preserved, fixtures copied, dedup guards correctly dropped since the test now runs in both dev and start modes via e2e harness.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 (via `runTest()` called twice = same test), converted: 1                                |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                           |
| 1c  | Test titles         | pass    | "loads a middleware" preserved                                                                      |
| 1d  | Describe blocks     | pass    | two mode describes flattened into one — appropriate since e2e runs both modes                       |
| 2a  | URL paths           | pass    | `/post-1` preserved                                                                                 |
| 2b  | Response checks     | pass    | header presence check preserved                                                                     |
| 2c  | FS checks           | na      |                                                                                                     |
| 2d  | Browser checks      | na      |                                                                                                     |
| 2e  | Build output        | na      |                                                                                                     |
| 2f  | Dynamic logic       | pass    | `runTest()` produced identical test in both modes; no divergence to preserve                        |
| 3a  | nextTestSetup       | pass    |                                                                                                     |
| 3b  | files param         | pass    | `files: __dirname`                                                                                  |
| 3c  | skipStart           | na      | not build-only                                                                                      |
| 3d  | No manual lifecycle | pass    |                                                                                                     |
| 3e  | Cleanup             | pass    | none needed                                                                                         |
| 4a  | Directory placement | pass    | `test/e2e/` correct — original ran in both modes                                                    |
| 4b  | Mode guards         | pass    | no divergence needed                                                                                |
| 4c  | Turbopack guards    | pass    | original's `TURBOPACK_DEV`/`TURBOPACK_BUILD` were dedup guards, not skip guards — correctly dropped |
| 4d  | Dedup guards        | pass    | handled implicitly by e2e harness mode selection                                                    |
| 4e  | No incorrect env    | pass    |                                                                                                     |
| 5a  | render              | na      |                                                                                                     |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                                                       |
| 5c  | browser             | na      |                                                                                                     |
| 5d  | check→retry         | na      |                                                                                                     |
| 5e  | File class          | na      |                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                     |
| 5g  | fs operations       | na      |                                                                                                     |
| 6a  | Fixtures exist      | pass    | middleware.ts, next.config.js, pages/index.js all present                                           |
| 6b  | next.config.js      | pass    |                                                                                                     |
| 6c  | Overrides           | na      |                                                                                                     |
| 7a  | No dead code        | pass    |                                                                                                     |
| 7b  | retry over timeout  | na      |                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                     |

## Issues

None

## Warnings

None
