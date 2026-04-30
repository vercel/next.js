# typescript-custom-tsconfig: PASS

The original single build-warning test is faithfully preserved in `test/production/`, and the `test/e2e/` file adds extra runtime coverage (app/pages/middleware) for the custom tsconfig feature.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                 |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 4 (1 in production + 3 new in e2e)                                                                                                           |
| 1b  | Assertions          | pass    | original: 1, converted: 4                                                                                                                                            |
| 1c  | Test titles         | pass    | "should warn when using custom typescript path" preserved in production                                                                                              |
| 1d  | Describe blocks     | pass    | Outer "Custom TypeScript Config" + inner "production mode" preserved in production file                                                                              |
| 2a  | URL paths           | na      | Original had no HTTP calls                                                                                                                                           |
| 2b  | Response checks     | pass    | e2e adds html rendering checks; production preserves cliOutput regex                                                                                                 |
| 2c  | FS checks           | na      |                                                                                                                                                                      |
| 2d  | Browser checks      | na      |                                                                                                                                                                      |
| 2e  | Build output        | pass    | `next.build()` + `next.cliOutput` matches `nextBuild` + stdout                                                                                                       |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                      |
| 3a  | nextTestSetup       | pass    | Both files use it                                                                                                                                                    |
| 3b  | files param         | pass    | e2e uses `FileRef(join(__dirname, '..'))`, production uses `__dirname`                                                                                               |
| 3c  | skipStart           | pass    | Production uses `skipStart: true` and calls `next.build()`                                                                                                           |
| 3d  | No manual lifecycle | pass    | No banned helpers                                                                                                                                                    |
| 3e  | Cleanup             | na      | No original cleanup to preserve                                                                                                                                      |
| 4a  | Directory placement | pass    | Build-warning test correctly in `test/production/`; runtime tests in `test/e2e/`                                                                                     |
| 4b  | Mode guards         | pass    | Production uses `isNextStart` early-return                                                                                                                           |
| 4c  | Turbopack guards    | pass    | Production wraps with `IS_TURBOPACK_TEST ? describe.skip` outside setup                                                                                              |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV` dedup obviated by moving to `test/production/`                                                                                              |
| 4e  | No incorrect env    | pass    | Uses `IS_TURBOPACK_TEST` only for outer wrap                                                                                                                         |
| 5a  | render              | pass    | e2e uses `next.render()`                                                                                                                                             |
| 5b  | fetch               | na      |                                                                                                                                                                      |
| 5c  | browser             | na      |                                                                                                                                                                      |
| 5d  | check→retry         | na      |                                                                                                                                                                      |
| 5e  | File class          | na      |                                                                                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                                                                      |
| 5g  | fs operations       | pass    | No direct fs on appDir                                                                                                                                               |
| 6a  | Fixtures exist      | pass    | production: next.config.js, web.tsconfig.json, pages/index.tsx; e2e: next.config.ts, web.tsconfig.json, bar.ts, middleware.ts, app/{layout,page}.tsx, pages/page.tsx |
| 6b  | next.config.js      | pass    | Both fixtures have it (production .js, e2e .ts)                                                                                                                      |
| 6c  | Overrides           | na      |                                                                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                                                                      |
| 7b  | retry over timeout  | na      |                                                                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                                                                      |

## Issues

None.

## Warnings

- The e2e file adds 3 tests (app/pages/middleware render) not present in the original; this is net-new coverage via `.render()` of the custom-tsconfig fixture, which is acceptable but goes beyond a 1:1 conversion.
- Minor: `isNextStart` early-return in production uses an inner `it('skipped for non-start mode', () => {})` placeholder — consistent with patterns elsewhere in the repo.
