# custom-server-types: PASS

Clean 1:1 conversion of a single build-only TypeScript compilation test with fixtures copied correctly.

## Criteria

| #   | Criterion           | Verdict | Note                                                                 |
| --- | ------------------- | ------- | -------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                            |
| 1b  | Assertions          | pass    | original: 0, converted: 0 (buildTS throws on failure)                |
| 1c  | Test titles         | pass    | "should build server.ts correctly" preserved                         |
| 1d  | Describe blocks     | pass    | "Custom Server TypeScript" preserved                                 |
| 2a  | URL paths           | na      | No HTTP requests                                                     |
| 2b  | Response checks     | na      |                                                                      |
| 2c  | FS checks           | na      |                                                                      |
| 2d  | Browser checks      | na      |                                                                      |
| 2e  | Build output        | pass    | buildTS invoked on next.testDir                                      |
| 2f  | Dynamic logic       | na      |                                                                      |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                    |
| 3b  | files param         | pass    | files: \_\_dirname                                                   |
| 3c  | skipStart           | pass    | skipStart: true (build-only)                                         |
| 3d  | No manual lifecycle | pass    |                                                                      |
| 3e  | Cleanup             | pass    |                                                                      |
| 4a  | Directory placement | pass    | test/production/ correct                                             |
| 4b  | Mode guards         | na      |                                                                      |
| 4c  | Turbopack guards    | na      |                                                                      |
| 4d  | Dedup guards        | na      |                                                                      |
| 4e  | No incorrect env    | pass    |                                                                      |
| 5a  | render              | na      |                                                                      |
| 5b  | fetch               | na      |                                                                      |
| 5c  | browser             | na      |                                                                      |
| 5d  | check→retry         | na      |                                                                      |
| 5e  | File class          | na      |                                                                      |
| 5f  | waitFor             | na      |                                                                      |
| 5g  | fs operations       | pass    | Uses next.testDir instead of appDir                                  |
| 6a  | Fixtures exist      | pass    | server.ts, pages/index.tsx, tsconfig.json, next-env.d.ts all present |
| 6b  | next.config.js      | na      | Original had none                                                    |
| 6c  | Overrides           | na      |                                                                      |
| 7a  | No dead code        | pass    |                                                                      |
| 7b  | retry over timeout  | na      |                                                                      |
| 7c  | async/await         | pass    |                                                                      |
| 7d  | eslint              | pass    |                                                                      |

## Issues

None

## Warnings

None
