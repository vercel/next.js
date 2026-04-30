# hashbang: PASS

Clean, minimal conversion — all 3 tests and assertions preserved, dev+prod coverage maintained via default e2e harness.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                         |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                                                                                    |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                                                                    |
| 1c  | Test titles         | pass    | All 3 preserved verbatim                                                                                                                     |
| 1d  | Describe blocks     | pass    | Inner describe preserved; outer dev/prod blocks collapsed (handled by e2e harness)                                                           |
| 2a  | URL paths           | pass    | `/` via `next.render` matches `renderViaHTTP`                                                                                                |
| 2b  | Response checks     | pass    | Same `toMatch` assertions                                                                                                                    |
| 2c  | FS checks           | na      |                                                                                                                                              |
| 2d  | Browser checks      | na      |                                                                                                                                              |
| 2e  | Build output        | na      |                                                                                                                                              |
| 2f  | Dynamic logic       | pass    | `runTests()` inlined; same tests for dev+prod                                                                                                |
| 3a  | nextTestSetup       | pass    | From `e2e-utils`                                                                                                                             |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                           |
| 3c  | skipStart           | na      | Not build-only                                                                                                                               |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/etc.                                                                                                                     |
| 3e  | Cleanup             | pass    | Harness handles it                                                                                                                           |
| 4a  | Directory placement | pass    | `test/e2e/` correct (both modes)                                                                                                             |
| 4b  | Mode guards         | na      | Same behavior dev/prod                                                                                                                       |
| 4c  | Turbopack guards    | na      | Not a turbopack-skipped suite                                                                                                                |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV/BUILD` guards were for dev/prod dedup within one file — unnecessary under e2e harness which runs one mode per CI job |
| 4e  | No incorrect env    | pass    |                                                                                                                                              |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                              |
| 5b  | fetch               | na      |                                                                                                                                              |
| 5c  | browser             | na      |                                                                                                                                              |
| 5d  | check→retry         | na      |                                                                                                                                              |
| 5e  | File class          | na      |                                                                                                                                              |
| 5f  | waitFor             | na      |                                                                                                                                              |
| 5g  | fs operations       | pass    | Original's `fs.remove(next.config.js)` was a no-op (file never existed); safely dropped                                                      |
| 6a  | Fixtures exist      | pass    | `src/pages/index.js`, `src/cases/{js.js,mjs.mjs,cjs.cjs}` all present                                                                        |
| 6b  | next.config.js      | na      | Neither original nor converted has one                                                                                                       |
| 6c  | Overrides           | na      |                                                                                                                                              |
| 7a  | No dead code        | pass    |                                                                                                                                              |
| 7b  | retry over timeout  | pass    |                                                                                                                                              |
| 7c  | async/await         | pass    |                                                                                                                                              |
| 7d  | eslint              | pass    |                                                                                                                                              |

## Issues

None

## Warnings

None
