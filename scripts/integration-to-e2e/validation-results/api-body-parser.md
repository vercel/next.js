# api-body-parser: PASS

Clean conversion: all 3 tests and assertions preserved, fixtures identical, custom server handled via `startCommand` + `serverReadyPattern`.

## Criteria

| #   | Criterion           | Verdict | Note                                                         |
| --- | ------------------- | ------- | ------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 3, converted: 3                                    |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                    |
| 1c  | Test titles         | pass    | All 3 titles preserved verbatim                              |
| 1d  | Describe blocks     | pass    | Split into two describes by server mode (cleaner)            |
| 2a  | URL paths           | pass    | `/api` preserved                                             |
| 2b  | Response checks     | pass    | JSON body + status 200 preserved                             |
| 2c  | FS checks           | na      |                                                              |
| 2d  | Browser checks      | na      |                                                              |
| 2e  | Build output        | na      |                                                              |
| 2f  | Dynamic logic       | na      |                                                              |
| 3a  | nextTestSetup       | pass    | Used correctly                                               |
| 3b  | files param         | pass    | `files: __dirname`                                           |
| 3c  | skipStart           | na      | Not build-only                                               |
| 3d  | No manual lifecycle | pass    | Custom server via `startCommand`, no manual findPort/killApp |
| 3e  | Cleanup             | pass    | nextTestSetup handles it                                     |
| 4a  | Directory placement | pass    | `test/e2e/` appropriate                                      |
| 4b  | Mode guards         | na      | Original doesn't split dev/prod                              |
| 4c  | Turbopack guards    | na      |                                                              |
| 4d  | Dedup guards        | na      |                                                              |
| 4e  | No incorrect env    | pass    |                                                              |
| 5a  | render              | na      |                                                              |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                |
| 5c  | browser             | na      |                                                              |
| 5d  | check→retry         | na      |                                                              |
| 5e  | File class          | na      |                                                              |
| 5f  | waitFor             | na      |                                                              |
| 5g  | fs operations       | na      |                                                              |
| 6a  | Fixtures exist      | pass    | pages/api, server.js identical to original                   |
| 6b  | next.config.js      | na      | Original had none                                            |
| 6c  | Overrides           | pass    | `dependencies.express: '4'` added for custom server          |
| 7a  | No dead code        | pass    |                                                              |
| 7b  | retry over timeout  | pass    |                                                              |
| 7c  | async/await         | pass    |                                                              |
| 7d  | eslint              | pass    |                                                              |

## Issues

None

## Warnings

None
