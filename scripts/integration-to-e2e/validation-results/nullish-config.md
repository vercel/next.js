# nullish-config: PASS

Straightforward conversion — both nullish config tests preserved with added "Hello World" render assertion.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                      |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 unique `it()` (×2 modes via describes = 4 invocations); converted: 2 `it()` (×2 modes via nextTestSetup)      |
| 1b  | Assertions          | pass    | original: 2 per test (if/else branch); converted: 2 per test + added `toContain('Hello World')`                           |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                            |
| 1d  | Describe blocks     | pass    | Nested `development mode`/`production mode` describes appropriately flattened — nextTestSetup handles mode selection      |
| 2a  | URL paths           | pass    | Converted adds `/` render to verify app works; original didn't render                                                     |
| 2b  | Response checks     | pass    | `cliOutput` regex checks preserved; HTML check added                                                                      |
| 2c  | FS checks           | na      |                                                                                                                           |
| 2d  | Browser checks      | na      |                                                                                                                           |
| 2e  | Build output        | pass    | `next.cliOutput` matches /Compiled successfully/i in prod; /ready/i in dev                                                |
| 2f  | Dynamic logic       | pass    | `runTests(type)` conditional replaced with `isNextDev` guard                                                              |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `'e2e-utils'`                                                                                   |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                        |
| 3c  | skipStart           | na      | Not build-only (server renders `/`)                                                                                       |
| 3d  | No manual lifecycle | pass    | No launchApp/nextBuild/killApp                                                                                            |
| 3e  | Cleanup             | pass    | isolated copy, no cleanup needed                                                                                          |
| 4a  | Directory placement | pass    | `test/e2e/` runs both dev and prod — matches original coverage                                                            |
| 4b  | Mode guards         | pass    | `isNextDev` guard distinguishes expected log output                                                                       |
| 4c  | Turbopack guards    | na      | No Turbopack-specific skip required                                                                                       |
| 4d  | Dedup guards        | na      | Original's `TURBOPACK_BUILD`/`TURBOPACK_DEV` guards were for split dev/prod describes; e2e-utils handles mode per-process |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD references                                                                               |
| 5a  | render              | pass    | `next.render('/')`                                                                                                        |
| 5b  | fetch               | na      |                                                                                                                           |
| 5c  | browser             | na      |                                                                                                                           |
| 5d  | check→retry         | na      |                                                                                                                           |
| 5e  | File class          | pass    | `fs.writeFile` → `next.patchFile()`                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                           |
| 5g  | fs operations       | pass    | No direct fs calls in converted                                                                                           |
| 6a  | Fixtures exist      | pass    | `pages/index.js` and `next.config.js` present                                                                             |
| 6b  | next.config.js      | pass    | Present with undefined nullish defaults                                                                                   |
| 6c  | Overrides           | na      |                                                                                                                           |
| 7a  | No dead code        | pass    |                                                                                                                           |
| 7b  | retry over timeout  | pass    | No setTimeout/waitFor                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                                           |
| 7d  | eslint              | pass    |                                                                                                                           |

## Issues

None.

## Warnings

None.
