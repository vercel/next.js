# missing-document-component-error: PASS

Clean 1:1 conversion of a dev-only `_document` error suite to `nextTestSetup` with `retry()` and file patching.

## Criteria

| #   | Criterion           | Verdict | Note                                                            |
| --- | ------------------- | ------- | --------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5, converted: 5                                       |
| 1b  | Assertions          | pass    | original: 10 `check` calls → converted: 10 `expect` calls       |
| 1c  | Test titles         | pass    | All 5 preserved verbatim                                        |
| 1d  | Describe blocks     | pass    | Single describe preserved                                       |
| 2a  | URL paths           | pass    | `/` via `next.render('/')`                                      |
| 2b  | Response checks     | pass    | stderr/cliOutput regex → `toContain` equivalents                |
| 2c  | FS checks           | pass    | `fs.writeFile`/`fs.remove` → `next.patchFile`/`next.deleteFile` |
| 2d  | Browser checks      | na      |                                                                 |
| 2e  | Build output        | na      | Dev-only                                                        |
| 2f  | Dynamic logic       | na      |                                                                 |
| 3a  | nextTestSetup       | pass    |                                                                 |
| 3b  | files param         | pass    | `files: __dirname`                                              |
| 3c  | skipStart           | na      | Not a build-only test                                           |
| 3d  | No manual lifecycle | pass    | `launchApp`/`killApp`/`findPort` removed                        |
| 3e  | Cleanup             | pass    | `deleteFile` between tests; harness handles app                 |
| 4a  | Directory placement | pass    | `test/development/` matches dev-only `launchApp` original       |
| 4b  | Mode guards         | na      |                                                                 |
| 4c  | Turbopack guards    | na      |                                                                 |
| 4d  | Dedup guards        | na      |                                                                 |
| 4e  | No incorrect env    | pass    |                                                                 |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                 |
| 5b  | fetch               | na      |                                                                 |
| 5c  | browser             | na      |                                                                 |
| 5d  | check→retry         | pass    | `check()` → `retry()` + `expect().toContain`                    |
| 5e  | File class          | na      |                                                                 |
| 5f  | waitFor             | na      |                                                                 |
| 5g  | fs operations       | pass    | Uses `next.patchFile`/`deleteFile`                              |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                        |
| 6b  | next.config.js      | na      | Original had none                                               |
| 6c  | Overrides           | na      |                                                                 |
| 7a  | No dead code        | pass    |                                                                 |
| 7b  | retry over timeout  | pass    |                                                                 |
| 7c  | async/await         | pass    | `.catch(() => {})` on render is intentional for error path      |
| 7d  | eslint              | pass    |                                                                 |

## Issues

None.

## Warnings

None.
