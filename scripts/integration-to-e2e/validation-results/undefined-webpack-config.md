# undefined-webpack-config: PASS

Conversion preserves both tests and structure; the production block is redundantly retained under `isNextStart` but harmless since it's `it.skip`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                               |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 2 (1 skip, 1 active), converted: 2 (1 skip, 1 active)                                                    |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                          |
| 1c  | Test titles         | pass    | "should show in production mode" preserved; dev title slightly reworded to "should show error in development mode" |
| 1d  | Describe blocks     | pass    | Outer describe + production mode nested describe preserved                                                         |
| 2a  | URL paths           | na      | No HTTP requests in either file                                                                                    |
| 2b  | Response checks     | pass    | stderr capture → `next.cliOutput` match                                                                            |
| 2c  | FS checks           | na      |                                                                                                                    |
| 2d  | Browser checks      | na      |                                                                                                                    |
| 2e  | Build output        | pass    | Skipped test uses `next.cliOutput` (matches intent, though skipped)                                                |
| 2f  | Dynamic logic       | pass    | Production vs dev split mapped to `isNextStart` guard                                                              |
| 3a  | nextTestSetup       | pass    | Imported from `e2e-utils`                                                                                          |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                 |
| 3c  | skipStart           | na      | Dev-only test; no skipStart needed                                                                                 |
| 3d  | No manual lifecycle | pass    | No `launchApp`/`nextBuild`/`findPort`                                                                              |
| 3e  | Cleanup             | pass    | nextTestSetup handles                                                                                              |
| 4a  | Directory placement | pass    | Originally dev-active + prod-skipped → `test/development/` is appropriate                                          |
| 4b  | Mode guards         | warn    | `isNextStart` branch in `test/development/` is dead (always false); acceptable since inner test is `it.skip`       |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST ? describe.skip : describe` wraps OUTSIDE `nextTestSetup`                                       |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV` guard dropped; replaced by dev-dir placement + isNextStart                                |
| 4e  | No incorrect env    | pass    |                                                                                                                    |
| 5a  | render              | na      |                                                                                                                    |
| 5b  | fetch               | na      |                                                                                                                    |
| 5c  | browser             | na      |                                                                                                                    |
| 5d  | check→retry         | pass    | `retry()` used for polling cliOutput                                                                               |
| 5e  | File class          | na      |                                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                                    |
| 5g  | fs operations       | na      |                                                                                                                    |
| 6a  | Fixtures exist      | pass    | `next.config.js`, `pages/index.js` present                                                                         |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                    |
| 7a  | No dead code        | warn    | Vestigial `production mode` describe in dev-only dir (inner test is already `it.skip`)                             |
| 7b  | retry over timeout  | pass    |                                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                                    |

## Issues

None

## Warnings

- The `;(isNextStart ? describe : describe.skip)('production mode', ...)` block in `test/development/` can never execute (isNextStart is always false in dev dir) and its inner test is `it.skip` anyway — could be removed to simplify.
- Runtime concern (not a static issue): the dev test relies on the dev server emitting the webpack error into `cliOutput` during `nextTestSetup` startup without an HTTP request being made. Worth verifying the error actually appears (original used `launchApp` with stderr capture similarly).
