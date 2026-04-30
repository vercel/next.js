# custom-routes-i18n-index-redirect: PASS

Clean conversion — single test preserved with equivalent behavior, dead external server scaffolding dropped.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                               |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 `it` (run in dev+prod describes), converted: 1 `it` (nextTestSetup runs in both modes) |
| 1b  | Assertions          | pass    | original: 5 expects, converted: 5 expects                                                          |
| 1c  | Test titles         | pass    | Identical title preserved                                                                          |
| 1d  | Describe blocks     | pass    | Top-level describe preserved; dev/prod sub-describes flattened into nextTestSetup                  |
| 2a  | URL paths           | pass    | `/`, `/en`, `/fr` all tested                                                                       |
| 2b  | Response checks     | pass    | status, location header, text body all preserved                                                   |
| 2c  | FS checks           | na      |                                                                                                    |
| 2d  | Browser checks      | na      |                                                                                                    |
| 2e  | Build output        | na      |                                                                                                    |
| 2f  | Dynamic logic       | pass    | `runTests()` helper inlined once — original called it identically in both modes                    |
| 3a  | nextTestSetup       | pass    |                                                                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                                 |
| 3c  | skipStart           | na      | Not build-only                                                                                     |
| 3d  | No manual lifecycle | pass    | No launchApp/findPort/killApp/nextBuild                                                            |
| 3e  | Cleanup             | pass    | External http server in original was unused (orphaned externalPort) — correctly dropped            |
| 4a  | Directory placement | pass    | `test/e2e/` correct; original ran dev+prod                                                         |
| 4b  | Mode guards         | pass    | Same tests in both modes, no guards needed                                                         |
| 4c  | Turbopack guards    | na      |                                                                                                    |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_DEV/TURBOPACK_BUILD guards handled by nextTestSetup single-mode-per-run         |
| 4e  | No incorrect env    | pass    |                                                                                                    |
| 5a  | render              | na      |                                                                                                    |
| 5b  | fetch               | pass    | `fetchViaHTTP(appPort, path, undefined, opts)` → `next.fetch(path, opts)`                          |
| 5c  | browser             | na      |                                                                                                    |
| 5d  | check→retry         | na      |                                                                                                    |
| 5e  | File class          | na      |                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                    |
| 5g  | fs operations       | na      |                                                                                                    |
| 6a  | Fixtures exist      | pass    | pages/index.js, next.config.js present                                                             |
| 6b  | next.config.js      | pass    | Copied over                                                                                        |
| 6c  | Overrides           | na      |                                                                                                    |
| 7a  | No dead code        | pass    | Unused external server scaffolding correctly removed                                               |
| 7b  | retry over timeout  | pass    |                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                    |

## Issues

None

## Warnings

None
