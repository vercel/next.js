# invalid-config-values: PASS

Straightforward conversion of a build-only assetPrefix validation suite; all tests, titles, and assertions preserved, fixtures intact, using skipStart + next.build() correctly.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                 |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                                                            |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                                                            |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                                                       |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner `production mode` flattened (appropriate since suite is now prod-only)                                               |
| 2a  | URL paths           | na      | No HTTP requests in suite                                                                                                                            |
| 2b  | Response checks     | na      |                                                                                                                                                      |
| 2c  | FS checks           | pass    | next.config.js written via next.patchFile                                                                                                            |
| 2d  | Browser checks      | na      |                                                                                                                                                      |
| 2e  | Build output        | pass    | next.build() cliOutput vs nextBuild stderr — equivalent                                                                                              |
| 2f  | Dynamic logic       | na      |                                                                                                                                                      |
| 3a  | nextTestSetup       | pass    | Uses e2e-utils nextTestSetup                                                                                                                         |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                   |
| 3c  | skipStart           | pass    | Build-only test, skipStart: true set                                                                                                                 |
| 3d  | No manual lifecycle | pass    | No nextBuild/findPort imports                                                                                                                        |
| 3e  | Cleanup             | pass    | Isolated test dir handles cleanup; beforeAll/afterAll cleanUp no longer needed                                                                       |
| 4a  | Directory placement | pass    | test/production/ correct for build-only                                                                                                              |
| 4b  | Mode guards         | na      |                                                                                                                                                      |
| 4c  | Turbopack guards    | na      |                                                                                                                                                      |
| 4d  | Dedup guards        | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip : describe` (likely a stale/no-op guard for a prod-only suite); not reproduced in conversion |
| 4e  | No incorrect env    | pass    |                                                                                                                                                      |
| 5a  | render              | na      |                                                                                                                                                      |
| 5b  | fetch               | na      |                                                                                                                                                      |
| 5c  | browser             | na      |                                                                                                                                                      |
| 5d  | check→retry         | na      |                                                                                                                                                      |
| 5e  | File class          | na      |                                                                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                                                      |
| 5g  | fs operations       | pass    | fs.writeFile replaced with next.patchFile                                                                                                            |
| 6a  | Fixtures exist      | pass    | pages/index.js present                                                                                                                               |
| 6b  | next.config.js      | pass    | Written dynamically by each test via patchFile (same as original)                                                                                    |
| 6c  | Overrides           | na      |                                                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                                                      |
| 7b  | retry over timeout  | na      |                                                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                                                      |

## Issues

None

## Warnings

- 4d: Original wrapped the production-mode describe with `process.env.TURBOPACK_DEV ? describe.skip : describe`. The converted file drops this guard. Since the suite now lives under `test/production/` and only runs in prod modes, `TURBOPACK_DEV` would not typically be set during these runs, so the practical impact is likely nil — but worth flagging in case CI dedup semantics rely on it.
