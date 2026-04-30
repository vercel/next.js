All fixtures match. The conversion looks clean.

# externals-esm-loose: PASS

Clean 1:1 conversion with all 3 tests, assertions, and fixtures preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                   |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3 (+1 no-op skip guard)                                                                                                                        |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                                                                                              |
| 1c  | Test titles         | pass    | All 3 preserved verbatim                                                                                                                                               |
| 1d  | Describe blocks     | pass    | Outer + inner production-mode describe preserved                                                                                                                       |
| 2a  | URL paths           | pass    | /static, /ssr, /ssg all mapped to next.render                                                                                                                          |
| 2b  | Response checks     | pass    | Same regex match on HTML                                                                                                                                               |
| 2c  | FS checks           | na      |                                                                                                                                                                        |
| 2d  | Browser checks      | na      |                                                                                                                                                                        |
| 2e  | Build output        | na      |                                                                                                                                                                        |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                        |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                     |
| 3c  | skipStart           | na      | Needs server running                                                                                                                                                   |
| 3d  | No manual lifecycle | pass    | No nextBuild/nextStart/killApp                                                                                                                                         |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                                               |
| 4a  | Directory placement | pass    | test/production/ matches prod-only original                                                                                                                            |
| 4b  | Mode guards         | pass    | `isNextStart` guard used                                                                                                                                               |
| 4c  | Turbopack guards    | warn    | `IS_TURBOPACK_TEST ? describe.skip` wraps the outer describe, but `nextTestSetup` is inside an inner describe that also still gets evaluated; acceptable per checklist |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_DEV` describe.skip; converted drops that but replaces with isNextStart guard                                                                   |
| 4e  | No incorrect env    | pass    | Only `IS_TURBOPACK_TEST` used at top                                                                                                                                   |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                                                                                            |
| 5b  | fetch               | na      |                                                                                                                                                                        |
| 5c  | browser             | na      |                                                                                                                                                                        |
| 5d  | check→retry         | na      |                                                                                                                                                                        |
| 5e  | File class          | na      |                                                                                                                                                                        |
| 5f  | waitFor             | na      |                                                                                                                                                                        |
| 5g  | fs operations       | na      |                                                                                                                                                                        |
| 6a  | Fixtures exist      | pass    | pages/{static,ssr,ssg}.js, next.config.js, node_modules present                                                                                                        |
| 6b  | next.config.js      | pass    | Present                                                                                                                                                                |
| 6c  | Overrides           | na      |                                                                                                                                                                        |
| 7a  | No dead code        | pass    |                                                                                                                                                                        |
| 7b  | retry over timeout  | na      |                                                                                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                                                                                        |

## Issues

None.

## Warnings

- The outer `IS_TURBOPACK_TEST ? describe.skip : describe` wraps correctly, but `nextTestSetup()` is called inside the inner `production mode` describe — since the outer `describe.skip` prevents inner registration under Turbopack, the setup won't run, so this is fine.
- Original had a `TURBOPACK_DEV ? describe.skip` dedup inside the outer guard; converted replaces it with an `isNextStart` early-return no-op test. Functionally equivalent for a production-only file in `test/production/`.
