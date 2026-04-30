# compression: PASS

Clean 1:1 conversion of a single-test dev suite. All behavioral assertions preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                             |
| 1b  | Assertions          | pass    | original: 1, converted: 1                             |
| 1c  | Test titles         | pass    | "should compress responses by default" preserved      |
| 1d  | Describe blocks     | pass    | "Compression" describe preserved                      |
| 2a  | URL paths           | pass    | `/` fetched in both                                   |
| 2b  | Response checks     | pass    | content-encoding header check preserved               |
| 2c  | FS checks           | na      |                                                       |
| 2d  | Browser checks      | na      |                                                       |
| 2e  | Build output        | na      |                                                       |
| 2f  | Dynamic logic       | na      |                                                       |
| 3a  | nextTestSetup       | pass    | uses `nextTestSetup` from `e2e-utils`                 |
| 3b  | files param         | pass    | `files: __dirname`                                    |
| 3c  | skipStart           | na      | Not build-only                                        |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                         |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                              |
| 4a  | Directory placement | pass    | Original used `launchApp` (dev) → `test/development/` |
| 4b  | Mode guards         | na      |                                                       |
| 4c  | Turbopack guards    | na      |                                                       |
| 4d  | Dedup guards        | na      |                                                       |
| 4e  | No incorrect env    | pass    |                                                       |
| 5a  | render              | na      | No renderViaHTTP in converted (only used for warm-up) |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                         |
| 5c  | browser             | na      |                                                       |
| 5d  | check→retry         | na      |                                                       |
| 5e  | File class          | na      |                                                       |
| 5f  | waitFor             | na      |                                                       |
| 5g  | fs operations       | na      |                                                       |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                              |
| 6b  | next.config.js      | na      | Original had none                                     |
| 6c  | Overrides           | na      |                                                       |
| 7a  | No dead code        | pass    |                                                       |
| 7b  | retry over timeout  | pass    |                                                       |
| 7c  | async/await         | pass    |                                                       |
| 7d  | eslint              | pass    |                                                       |

## Issues

None.

## Warnings

None. The original's pre-render warm-up call was dropped, but it was purely a warm-up (no assertions) and the compression header check still works on the direct fetch.
