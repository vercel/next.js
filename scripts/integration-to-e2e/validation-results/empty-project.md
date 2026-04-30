# empty-project: PASS

Clean, minimal conversion that preserves the single test and lifecycle correctly.

## Criteria

| #   | Criterion           | Verdict | Note                                                                         |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                    |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                    |
| 1c  | Test titles         | pass    | Title preserved verbatim                                                     |
| 1d  | Describe blocks     | pass    | Same single describe                                                         |
| 2a  | URL paths           | pass    | `/` fetched in both                                                          |
| 2b  | Response checks     | pass    | `res.status === 404` preserved                                               |
| 2c  | FS checks           | pass    | `.gitkeep` deletion handled via `next.deleteFile`                            |
| 2d  | Browser checks      | na      |                                                                              |
| 2e  | Build output        | na      |                                                                              |
| 2f  | Dynamic logic       | na      |                                                                              |
| 3a  | nextTestSetup       | pass    |                                                                              |
| 3b  | files param         | pass    | `files: __dirname`                                                           |
| 3c  | skipStart           | pass    | Uses `skipStart: true` with explicit `next.start()` after gitkeep removal    |
| 3d  | No manual lifecycle | pass    | No forbidden helpers                                                         |
| 3e  | Cleanup             | pass    | Gitkeep recreation in original afterAll not needed — isolated test directory |
| 4a  | Directory placement | pass    | `test/development/` (original was integration/dev-only)                      |
| 4b  | Mode guards         | na      |                                                                              |
| 4c  | Turbopack guards    | na      |                                                                              |
| 4d  | Dedup guards        | na      |                                                                              |
| 4e  | No incorrect env    | pass    |                                                                              |
| 5a  | render              | na      |                                                                              |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                                |
| 5c  | browser             | na      |                                                                              |
| 5d  | check→retry         | na      |                                                                              |
| 5e  | File class          | na      |                                                                              |
| 5f  | waitFor             | na      |                                                                              |
| 5g  | fs operations       | pass    | `fs.unlinkSync` → `next.deleteFile`                                          |
| 6a  | Fixtures exist      | pass    | `next.config.js`, `pages/.gitkeep` present                                   |
| 6b  | next.config.js      | pass    | Copied over                                                                  |
| 6c  | Overrides           | na      |                                                                              |
| 7a  | No dead code        | pass    |                                                                              |
| 7b  | retry over timeout  | na      |                                                                              |
| 7c  | async/await         | pass    |                                                                              |
| 7d  | eslint              | pass    |                                                                              |

## Issues

None

## Warnings

None
