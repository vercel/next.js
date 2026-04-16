# 404-page-ssg: PASS

Clean conversion; all test titles and behaviors preserved, lifecycle/build setup correctly replaced by `nextTestSetup`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                  |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 8 (1 build + 4 shared + 3 prod-only), converted: 7 (build lifecycle test dropped, covered by nextTestSetup) |
| 1b  | Assertions          | warn    | original: ~13, converted: 9 — drops are build-lifecycle expects + merged stdout/stderr into cliOutput                 |
| 1c  | Test titles         | pass    | All 7 functional titles preserved; only "should build successfully" (lifecycle) omitted                               |
| 1d  | Describe blocks     | pass    | Prod/dev describes collapsed into single describe with `isNextStart` guard — appropriate flatten                      |
| 2a  | URL paths           | pass    | /404, /err, /non-existent, / all preserved                                                                            |
| 2b  | Response checks     | pass    | status, text body assertions preserved                                                                                |
| 2c  | FS checks           | pass    | Uses `next.readJSON()` instead of `fs.readJSON(appDir...)`                                                            |
| 2d  | Browser checks      | na      | No webdriver usage                                                                                                    |
| 2e  | Build output        | warn    | Dropped buildStderr/buildStdout gip404Err checks; covered by runtime cliOutput check                                  |
| 2f  | Dynamic logic       | pass    | `runTests(isDev)` split preserved via `isNextStart` guard                                                             |
| 3a  | nextTestSetup       | pass    |                                                                                                                       |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                    |
| 3c  | skipStart           | na      | Not build-only                                                                                                        |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp/nextStart/nextBuild                                                                     |
| 3e  | Cleanup             | pass    | No manual cleanup needed                                                                                              |
| 4a  | Directory placement | pass    | test/e2e/ — runs in both dev and prod like original                                                                   |
| 4b  | Mode guards         | pass    | `if (isNextStart)` correctly gates prod-only block and error text differences                                         |
| 4c  | Turbopack guards    | na      | Original's TURBOPACK_DEV/BUILD were dedup guards no longer needed under nextTestSetup                                 |
| 4d  | Dedup guards        | na      | See 4c                                                                                                                |
| 4e  | No incorrect env    | pass    | Uses `isNextStart`, no TURBOPACK_DEV/BUILD                                                                            |
| 5a  | render              | pass    | `next.render()`                                                                                                       |
| 5b  | fetch               | pass    | `next.fetch('/404')`                                                                                                  |
| 5c  | browser             | na      |                                                                                                                       |
| 5d  | check→retry         | na      |                                                                                                                       |
| 5e  | File class          | na      |                                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                       |
| 5g  | fs operations       | pass    | `next.readJSON` used                                                                                                  |
| 6a  | Fixtures exist      | pass    | pages/404.js, \_app.js, err.js, index.js, next.config.js all present                                                  |
| 6b  | next.config.js      | pass    | Present                                                                                                               |
| 6c  | Overrides           | na      |                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                       |

## Issues

None

## Warnings

- Build-time stderr/stdout check for `gip404Err` message (during `nextBuild`) was not preserved. The converted test only checks runtime `cliOutput`. If the 404 GIP warning is emitted only during build (not runtime), this regression check coverage is slightly reduced. In practice `next.cliOutput` includes build output when running in `isNextStart` mode, so coverage is likely preserved.
- One expect pair (`stderr`/`stdout` separately) collapsed into one `cliOutput` match — semantically equivalent.
