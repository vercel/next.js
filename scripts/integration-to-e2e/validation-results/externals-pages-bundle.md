# externals-pages-bundle: PASS

Clean conversion covering all 3 original tests with equivalent assertions and correct mode guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                   |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3 real, converted: 3 real (+ 2 skip placeholders)                                                            |
| 1b  | Assertions          | pass    | original: ~7, converted: ~7                                                                                            |
| 1c  | Test titles         | pass    | All 3 titles preserved verbatim                                                                                        |
| 1d  | Describe blocks     | pass    | Nested describe structure preserved, split by mode                                                                     |
| 2a  | URL paths           | pass    | `/` rendered in dev test                                                                                               |
| 2b  | Response checks     | pass    | Bundle content assertions preserved                                                                                    |
| 2c  | FS checks           | pass    | `.next/server/pages/index.js` via `next.readFile()`; ssr chunks dir via `next.testDir`                                 |
| 2d  | Browser checks      | na      |                                                                                                                        |
| 2e  | Build output        | pass    | `next.build()` replaces `nextBuild()`                                                                                  |
| 2f  | Dynamic logic       | pass    | Dev vs prod paths split into separate describes with `isNextDev`/`isNextStart`                                         |
| 3a  | nextTestSetup       | pass    | Used correctly                                                                                                         |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                     |
| 3c  | skipStart           | pass    | `skipStart: true` with explicit `next.build()` and `next.start()`                                                      |
| 3d  | No manual lifecycle | pass    | No killApp/launchApp/nextBuild/findPort                                                                                |
| 3e  | Cleanup             | pass    | Isolated test dir handles cleanup; no `config.restore()` needed                                                        |
| 4a  | Directory placement | pass    | `test/e2e/` appropriate since both dev and prod paths exist                                                            |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` correctly gate dev-only / prod-only blocks                                                   |
| 4c  | Turbopack guards    | pass    | Uses `isTurbopack` inside assertions, not for skipping describes                                                       |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV ? describe.skip` is effectively covered by `isNextStart` guard (TURBOPACK_DEV runs as dev)     |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` references                                                                        |
| 5a  | render              | pass    | `next.render('/')` replaces `renderViaHTTP`                                                                            |
| 5b  | fetch               | na      |                                                                                                                        |
| 5c  | browser             | na      |                                                                                                                        |
| 5d  | check→retry         | na      |                                                                                                                        |
| 5e  | File class          | pass    | `new File(...).delete()` replaced with `next.deleteFile()`                                                             |
| 5f  | waitFor             | na      |                                                                                                                        |
| 5g  | fs operations       | pass    | Direct file reads replaced with `next.readFile()`; ssr chunks dir listing uses `next.testDir` (acceptable for readdir) |
| 6a  | Fixtures exist      | pass    | pages/index.js, next.config.js, node_modules/external-package, node_modules/opted-out-external-package all present     |
| 6b  | next.config.js      | pass    | Identical to original                                                                                                  |
| 6c  | Overrides           | na      |                                                                                                                        |
| 7a  | No dead code        | pass    |                                                                                                                        |
| 7b  | retry over timeout  | pass    |                                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                                        |

## Issues

None

## Warnings

None
