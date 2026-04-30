# fallback-modules: PASS

Single-test build-size suite converted cleanly with proper skipStart lifecycle and fixture copy.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                          |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                     |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                     |
| 1c  | Test titles         | pass    | "should not include crypto" preserved                                                         |
| 1d  | Describe blocks     | pass    | Outer "Fallback Modules" preserved; nested mode/app describes flattened (prod-only directory) |
| 2a  | URL paths           | na      | No HTTP requests                                                                              |
| 2b  | Response checks     | na      |                                                                                               |
| 2c  | FS checks           | pass    | Uses `next.testDir` for manifest + chunk stat reads                                           |
| 2d  | Browser checks      | na      |                                                                                               |
| 2e  | Build output        | pass    | Uses `next.build()`                                                                           |
| 2f  | Dynamic logic       | na      |                                                                                               |
| 3a  | nextTestSetup       | pass    |                                                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                                                            |
| 3c  | skipStart           | pass    | Build-only, `skipStart: true` + `await next.build()`                                          |
| 3d  | No manual lifecycle | pass    | `nextBuild` removed                                                                           |
| 3e  | Cleanup             | pass    | `.next` cleanup not needed (isolated)                                                         |
| 4a  | Directory placement | pass    | `test/production/` matches original prod-only scope                                           |
| 4b  | Mode guards         | na      | Prod-only, no dev branch                                                                      |
| 4c  | Turbopack guards    | na      | No turbopack-specific skip needed                                                             |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV` skip redundant once placed under test/production/                    |
| 4e  | No incorrect env    | pass    | No env guards used                                                                            |
| 5a  | render              | na      |                                                                                               |
| 5b  | fetch               | na      |                                                                                               |
| 5c  | browser             | na      |                                                                                               |
| 5d  | check→retry         | na      |                                                                                               |
| 5e  | File class          | na      |                                                                                               |
| 5f  | waitFor             | na      |                                                                                               |
| 5g  | fs operations       | pass    | Direct `fs` scoped to `next.testDir` (isolated) — acceptable for chunk size walk              |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                                                      |
| 6b  | next.config.js      | na      | Original had none                                                                             |
| 6c  | Overrides           | pass    | `dependencies: { seedrandom: 'latest' }` added correctly                                      |
| 7a  | No dead code        | pass    | Warning console.logs dropped cleanly                                                          |
| 7b  | retry over timeout  | na      |                                                                                               |
| 7c  | async/await         | pass    |                                                                                               |
| 7d  | eslint              | pass    |                                                                                               |

## Issues

None

## Warnings

None
