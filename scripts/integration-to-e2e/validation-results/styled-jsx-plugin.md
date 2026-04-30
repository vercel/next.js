# styled-jsx-plugin: PASS

Faithful 1:1 conversion of a single-test build+start suite using nextTestSetup with Turbopack skip guard outside setup.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                 |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                                            |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                                                            |
| 1c  | Test titles         | pass    | "should serve a page correctly" preserved                                                                                            |
| 1d  | Describe blocks     | pass    | Outer Turbopack skip describe preserved; inner production-mode describe flattened (nextTestSetup handles build+start)                |
| 2a  | URL paths           | pass    | `/` via next.render                                                                                                                  |
| 2b  | Response checks     | pass    | `toContain('Hello World')` preserved                                                                                                 |
| 2c  | FS checks           | na      |                                                                                                                                      |
| 2d  | Browser checks      | na      |                                                                                                                                      |
| 2e  | Build output        | na      | Original logged stdout/stderr but had no assertions on it                                                                            |
| 2f  | Dynamic logic       | na      |                                                                                                                                      |
| 3a  | nextTestSetup       | pass    |                                                                                                                                      |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                   |
| 3c  | skipStart           | na      | Needs server for render; default build+start is correct                                                                              |
| 3d  | No manual lifecycle | pass    | No killApp/findPort/nextBuild                                                                                                        |
| 3e  | Cleanup             | pass    |                                                                                                                                      |
| 4a  | Directory placement | pass    | test/production/ matches original production-only mode                                                                               |
| 4b  | Mode guards         | na      |                                                                                                                                      |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST ? describe.skip : describe` wraps outside setup                                                                   |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_DEV ? describe.skip` inner guard; not reproduced but it's redundant under the outer `IS_TURBOPACK_TEST` skip |
| 4e  | No incorrect env    | pass    |                                                                                                                                      |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                      |
| 5b  | fetch               | na      |                                                                                                                                      |
| 5c  | browser             | na      |                                                                                                                                      |
| 5d  | check→retry         | na      |                                                                                                                                      |
| 5e  | File class          | na      |                                                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                                      |
| 5g  | fs operations       | na      |                                                                                                                                      |
| 6a  | Fixtures exist      | pass    | pages/index.js, .babelrc.js, postcss.config.js present                                                                               |
| 6b  | next.config.js      | na      | Original had none; postcss config moved from package.json to postcss.config.js                                                       |
| 6c  | Overrides           | pass    | dependencies declared via `dependencies` option match original package.json deps                                                     |
| 7a  | No dead code        | pass    |                                                                                                                                      |
| 7b  | retry over timeout  | na      |                                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                                      |

## Issues

None

## Warnings

- Inner `TURBOPACK_DEV` guard from original was dropped, but this is redundant since the outer `IS_TURBOPACK_TEST` already skips the suite for all Turbopack CI runs.
