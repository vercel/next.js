# import-attributes: PASS

Clean 1:1 conversion; single test preserved across dev+prod via nextTestSetup, fixtures are complete.

## Criteria

| #   | Criterion           | Verdict | Note                                                                |
| --- | ------------------- | ------- | ------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 (×2 suites dev+prod), converted: 1 (runs in both modes) |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                           |
| 1c  | Test titles         | pass    | "should handle json attributes" preserved                           |
| 1d  | Describe blocks     | pass    | runDevSuite/runProdSuite replaced by nextTestSetup                  |
| 2a  | URL paths           | pass    | /es and /ts                                                         |
| 2b  | Response checks     | pass    | HTML contains checks preserved                                      |
| 2c  | FS checks           | na      |                                                                     |
| 2d  | Browser checks      | na      |                                                                     |
| 2e  | Build output        | na      |                                                                     |
| 2f  | Dynamic logic       | na      | basic() helper inlined                                              |
| 3a  | nextTestSetup       | pass    |                                                                     |
| 3b  | files param         | pass    | files: \_\_dirname                                                  |
| 3c  | skipStart           | na      | needs start for render                                              |
| 3d  | No manual lifecycle | pass    |                                                                     |
| 3e  | Cleanup             | na      |                                                                     |
| 4a  | Directory placement | pass    | test/e2e/ correct (dev+prod coverage)                               |
| 4b  | Mode guards         | na      | same behavior in both modes                                         |
| 4c  | Turbopack guards    | na      |                                                                     |
| 4d  | Dedup guards        | na      |                                                                     |
| 4e  | No incorrect env    | pass    |                                                                     |
| 5a  | render              | pass    | renderViaHTTP → next.render                                         |
| 5b  | fetch               | na      |                                                                     |
| 5c  | browser             | na      |                                                                     |
| 5d  | check→retry         | na      |                                                                     |
| 5e  | File class          | na      |                                                                     |
| 5f  | waitFor             | na      |                                                                     |
| 5g  | fs operations       | na      |                                                                     |
| 6a  | Fixtures exist      | pass    | pages/es.js, pages/ts.ts, data, data.d.ts, tsconfig.json            |
| 6b  | next.config.js      | na      | original had none                                                   |
| 6c  | Overrides           | na      |                                                                     |
| 7a  | No dead code        | pass    |                                                                     |
| 7b  | retry over timeout  | pass    |                                                                     |
| 7c  | async/await         | pass    |                                                                     |
| 7d  | eslint              | pass    |                                                                     |

## Issues

None

## Warnings

None
