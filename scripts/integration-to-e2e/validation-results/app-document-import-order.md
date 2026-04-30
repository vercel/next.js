# app-document-import-order: PASS

Clean conversion preserving both test cases with proper Turbopack skip guards and isolated fixtures.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                      |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 unique `it`s (run in dev+prod), converted: 2                                                                                  |
| 1b  | Assertions          | pass    | Both equivalent (forEach expect + chunk order expect)                                                                                     |
| 1c  | Test titles         | pass    | Both preserved (minor wording fix "de"→"the")                                                                                             |
| 1d  | Describe blocks     | pass    | Flattened; dev/prod describes collapsed into nextTestSetup                                                                                |
| 2a  | URL paths           | pass    | `/` preserved via `next.render$('/')`                                                                                                     |
| 2b  | Response checks     | pass    | Same cheerio selectors and assertions                                                                                                     |
| 2c  | FS checks           | na      |                                                                                                                                           |
| 2d  | Browser checks      | na      |                                                                                                                                           |
| 2e  | Build output        | na      |                                                                                                                                           |
| 2f  | Dynamic logic       | pass    | Helpers inlined; mode-specific logic unified via nextTestSetup                                                                            |
| 3a  | nextTestSetup       | pass    |                                                                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                        |
| 3c  | skipStart           | na      | Not build-only                                                                                                                            |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/etc                                                                                                                 |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                  |
| 4a  | Directory placement | pass    | Runs in both modes → `test/e2e/` correct                                                                                                  |
| 4b  | Mode guards         | na      | Same behavior in dev and prod                                                                                                             |
| 4c  | Turbopack guards    | pass    | `isTurbopack ? it.skip : it` used correctly for webpack-only test                                                                         |
| 4d  | Dedup guards        | pass    | TURBOPACK_DEV/BUILD guards no longer needed—nextTestSetup splits modes natively                                                           |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack` from setup                                                                                                             |
| 5a  | render              | pass    | `renderViaHTTP → next.render$`                                                                                                            |
| 5b  | fetch               | pass    | `fetchViaHTTP` replaced by `render$` (cheerio-wrapped)                                                                                    |
| 5c  | browser             | na      |                                                                                                                                           |
| 5d  | check→retry         | na      |                                                                                                                                           |
| 5e  | File class          | na      |                                                                                                                                           |
| 5f  | waitFor             | na      |                                                                                                                                           |
| 5g  | fs operations       | na      |                                                                                                                                           |
| 6a  | Fixtures exist      | pass    | pages/\_app.js, pages/\_document.js, pages/index.js, next.config.js, requiredByApp.js, requiredByPage.js, sideEffectModule.js all present |
| 6b  | next.config.js      | pass    | Present                                                                                                                                   |
| 6c  | Overrides           | na      |                                                                                                                                           |
| 7a  | No dead code        | pass    |                                                                                                                                           |
| 7b  | retry over timeout  | na      |                                                                                                                                           |
| 7c  | async/await         | pass    |                                                                                                                                           |
| 7d  | eslint              | pass    | Has `no-standalone-expect` disable for the conditional `it`                                                                               |

## Issues

None.

## Warnings

None.
