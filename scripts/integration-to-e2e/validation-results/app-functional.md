# app-functional: PASS

Clean 1:1 conversion of a single-test suite using `nextTestSetup` with fixtures in `__dirname`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                         |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                    |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                    |
| 1c  | Test titles         | pass    | "should not have any missing key warnings" preserved                         |
| 1d  | Describe blocks     | pass    | "Document and App" preserved                                                 |
| 2a  | URL paths           | pass    | `/` preserved via `next.render('/')`                                         |
| 2b  | Response checks     | pass    | Same HTML regex assertion                                                    |
| 2c  | FS checks           | na      |                                                                              |
| 2d  | Browser checks      | na      |                                                                              |
| 2e  | Build output        | na      |                                                                              |
| 2f  | Dynamic logic       | na      |                                                                              |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                           |
| 3c  | skipStart           | na      | Not a build-only test                                                        |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                                |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                     |
| 4a  | Directory placement | pass    | `test/development/` — original only launched dev via `launchApp`             |
| 4b  | Mode guards         | na      |                                                                              |
| 4c  | Turbopack guards    | na      |                                                                              |
| 4d  | Dedup guards        | na      |                                                                              |
| 4e  | No incorrect env    | pass    |                                                                              |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                              |
| 5b  | fetch               | na      |                                                                              |
| 5c  | browser             | na      |                                                                              |
| 5d  | check→retry         | na      |                                                                              |
| 5e  | File class          | na      |                                                                              |
| 5f  | waitFor             | na      |                                                                              |
| 5g  | fs operations       | na      |                                                                              |
| 6a  | Fixtures exist      | pass    | pages/\_app.js, pages/index.js, next.config.js, shared-module.js all present |
| 6b  | next.config.js      | pass    | Copied to converted fixture dir                                              |
| 6c  | Overrides           | na      |                                                                              |
| 7a  | No dead code        | pass    | Dropped unused `collectOutput`/`context.output` (was unused in original too) |
| 7b  | retry over timeout  | na      |                                                                              |
| 7c  | async/await         | pass    |                                                                              |
| 7d  | eslint              | pass    |                                                                              |

## Issues

None

## Warnings

None — the original had a pre-warm step (`await Promise.all([renderViaHTTP(appPort, '/')])`) that wasn't functionally meaningful for the single assertion and was omitted; a stray `collectOutput` helper in the original was never asserted against, so its removal is safe.
