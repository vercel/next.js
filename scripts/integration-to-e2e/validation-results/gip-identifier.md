# gip-identifier: WARN

Conversion is structurally correct and preserves dev-mode coverage, but the 3 mutation-based tests were gated to `isNextDev` only, dropping production-mode coverage that the original had.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                              |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | warn    | original: 4 tests × 2 modes = 8 runs; converted: 4 it() but 3 are dev-only → 5 effective runs                     |
| 1b  | Assertions          | warn    | original raw: 7 expects (×2 modes = 14 runtime); converted raw: 7 expects (dev: 7, prod: 2)                       |
| 1c  | Test titles         | pass    | All 4 titles preserved verbatim                                                                                   |
| 1d  | Describe blocks     | pass    | Inner dev/prod describes flattened into `isNextDev` guard (appropriate)                                           |
| 2a  | URL paths           | pass    | `/` via `next.render()`                                                                                           |
| 2b  | Response checks     | warn    | NEXT_DATA mutation assertions not run in prod (patchFile doesn't retrigger build)                                 |
| 2c  | FS checks           | na      | No build-artifact assertions                                                                                      |
| 2d  | Browser checks      | na      |                                                                                                                   |
| 2e  | Build output        | na      |                                                                                                                   |
| 2f  | Dynamic logic       | warn    | `runTests(isDev)` helper did the same 4 tests in both modes via rebuild; converted skips rebuild+mutation in prod |
| 3a  | nextTestSetup       | pass    | `{ files: __dirname }`                                                                                            |
| 3b  | files param         | pass    | `__dirname`                                                                                                       |
| 3c  | skipStart           | na      | Not a build-only test                                                                                             |
| 3d  | No manual lifecycle | pass    | No `findPort`/`killApp`/`launchApp` imports                                                                       |
| 3e  | Cleanup             | pass    | nextTestSetup handles isolated fs                                                                                 |
| 4a  | Directory placement | pass    | `test/e2e/` correct — runs in both modes (though 3 tests gate to dev)                                             |
| 4b  | Mode guards         | warn    | Uses `isNextDev` to skip mutation tests in prod; original ran them in prod via rebuild                            |
| 4c  | Turbopack guards    | na      | Original dedup guards not needed under nextTestSetup                                                              |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_BUILD`/`TURBOPACK_DEV` guards were legacy dedup; nextTestSetup handles mode selection         |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` checks                                                                       |
| 5a  | render              | pass    | `next.render('/')`                                                                                                |
| 5b  | fetch               | na      |                                                                                                                   |
| 5c  | browser             | na      |                                                                                                                   |
| 5d  | check→retry         | na      | Original didn't use check()                                                                                       |
| 5e  | File class          | na      | Original used fs-extra; converted uses `next.patchFile`                                                           |
| 5f  | waitFor             | pass    | Uses `retry()` after patchFile                                                                                    |
| 5g  | fs operations       | pass    | `next.patchFile` replaces `fs.writeFile(indexPage, ...)`                                                          |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                                                                          |
| 6b  | next.config.js      | na      | Original had none                                                                                                 |
| 6c  | Overrides           | na      |                                                                                                                   |
| 7a  | No dead code        | pass    |                                                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                   |
| 7d  | eslint              | pass    |                                                                                                                   |

## Issues

None (no fail-level problems).

## Warnings

- **Production-mode coverage loss**: The original ran all 4 tests in both dev and prod via `runTests(true)` / `runTests(false)`, rebuilding the app between mutations for prod. The converted test gates the 3 file-mutation tests behind `if (isNextDev)` because `next.patchFile()` won't affect an already-built production server. Result: tests 2, 3, and 4 no longer validate that gip/appGip detection works in production builds. To restore prod coverage, consider separate fixture directories (e.g., 3 production test files with different pre-built `pages/index.js` + `pages/_app.js` variants) invoked via `nextTestSetup({ files: path.join(__dirname, 'fixtures/...') })`.
- **Test 4 behavior changed**: Original restored original `indexPageContent`; converted writes a fresh `export default () => 'hi'`. Functionally equivalent (no gip) but not textually identical.
