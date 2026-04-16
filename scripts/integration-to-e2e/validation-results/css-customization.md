# css-customization: PASS

Conversion preserves all 20 tests, assertions, and describe structure; fixtures are all present.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                           |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 20, converted: 20                                                                                                    |
| 1b  | Assertions          | pass    | counts match (build output switched to `next.cliOutput`)                                                                       |
| 1c  | Test titles         | pass    | all preserved verbatim                                                                                                         |
| 1d  | Describe blocks     | pass    | full nesting preserved                                                                                                         |
| 2a  | URL paths           | na      | no HTTP calls in either                                                                                                        |
| 2b  | Response checks     | na      | build-only                                                                                                                     |
| 2c  | FS checks           | pass    | fs reads done against `next.testDir` (isolated copy)                                                                           |
| 2d  | Browser checks      | na      |                                                                                                                                |
| 2e  | Build output        | pass    | `nextBuild` stdout/stderr → `next.cliOutput`                                                                                   |
| 2f  | Dynamic logic       | na      |                                                                                                                                |
| 3a  | nextTestSetup       | pass    |                                                                                                                                |
| 3b  | files param         | pass    | uses `path.join(__dirname, 'css-fixtures/...')`                                                                                |
| 3c  | skipStart           | pass    | all use `skipStart: true` + `next.build()`                                                                                     |
| 3d  | No manual lifecycle | pass    |                                                                                                                                |
| 3e  | Cleanup             | pass    | `.next` remove no longer needed (isolated copies)                                                                              |
| 4a  | Directory placement | pass    | prod-only, placed in `test/production/`                                                                                        |
| 4b  | Mode guards         | na      |                                                                                                                                |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST` wraps outside setup                                                                                        |
| 4d  | Dedup guards        | warn    | original had inner `TURBOPACK_DEV` skip; redundant since outer IS_TURBOPACK_TEST already skips turbopack — dropping it is fine |
| 4e  | No incorrect env    | pass    |                                                                                                                                |
| 5a  | render              | na      |                                                                                                                                |
| 5b  | fetch               | na      |                                                                                                                                |
| 5c  | browser             | na      |                                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                                |
| 5e  | File class          | na      |                                                                                                                                |
| 5f  | waitFor             | na      |                                                                                                                                |
| 5g  | fs operations       | warn    | uses `fs.readdir`/`fs.readFile` on `next.testDir` instead of `next.readFile`; functional but could use helpers                 |
| 6a  | Fixtures exist      | pass    | all 12 fixture dirs with pages/\_app.js, index.js, .postcssrc.json/postcss.config.js present                                   |
| 6b  | next.config.js      | pass    | only custom-configuration-loader needs one; present                                                                            |
| 6c  | Overrides           | na      |                                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                                |
| 7b  | retry over timeout  | na      |                                                                                                                                |
| 7c  | async/await         | pass    |                                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                                |

## Issues

None

## Warnings

- `fs-extra` used directly against `next.testDir` for css folder listing — acceptable (directory scans need fs) but single-file reads could use `next.readFile`.
- Original's inner `TURBOPACK_DEV ? describe.skip` dedup wrapper was dropped; redundant given the outer `IS_TURBOPACK_TEST` skip, so behaviorally equivalent.
