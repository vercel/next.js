# i18n-support-catchall: PASS

Clean conversion with equivalent coverage, proper `nextTestSetup` usage, fixtures present, and `check()` migrated to `retry()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                            |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 6 it() (4 shared + 2 prod-only); converted: 6 it() (4 shared + 2 inside `if (isNextStart)`)           |
| 1b  | Assertions          | pass    | original ~46 expect, converted ~47 (added status check in SSR)                                                  |
| 1c  | Test titles         | pass    | All 6 titles preserved verbatim                                                                                 |
| 1d  | Describe blocks     | pass    | Dev/prod describes correctly flattened; prod-only block replaced with `if (isNextStart)`                        |
| 2a  | URL paths           | pass    | `/`, `/nl-NL`, `/nl-NL/another` all covered                                                                     |
| 2b  | Response checks     | pass    | status, html selectors, JSON props preserved                                                                    |
| 2c  | FS checks           | pass    | Uses `join(next.testDir, '.next/server')` + `fs.existsSync` for build output check (acceptable on isolated dir) |
| 2d  | Browser checks      | pass    | webdriver → next.browser with equivalent selectors                                                              |
| 2e  | Build output        | na      | No nextBuild return-value or stdout assertions                                                                  |
| 2f  | Dynamic logic       | pass    | `runTests(isDev)` split preserved via `isNextStart` guard                                                       |
| 3a  | nextTestSetup       | pass    | `nextTestSetup({ files: __dirname })`                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                                              |
| 3c  | skipStart           | na      | Test needs running server                                                                                       |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp/nextBuild/nextStart                                                               |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                        |
| 4a  | Directory placement | pass    | `test/e2e/` correct — runs in both dev and prod                                                                 |
| 4b  | Mode guards         | pass    | `isNextStart` guards prod-only tests                                                                            |
| 4c  | Turbopack guards    | na      | No turbopack-specific skips needed                                                                              |
| 4d  | Dedup guards        | na      | Original's TURBOPACK_DEV/TURBOPACK_BUILD dedup handled automatically by nextTestSetup mode selection            |
| 4e  | No incorrect env    | pass    |                                                                                                                 |
| 5a  | render              | pass    | Uses `next.render$`                                                                                             |
| 5b  | fetch               | pass    | `next.fetch('/', { redirect: 'manual' })`                                                                       |
| 5c  | browser             | pass    | `next.browser()` used                                                                                           |
| 5d  | check→retry         | pass    | All 4 `check()` calls migrated to `retry()` + `expect()`                                                        |
| 5e  | File class          | na      | Not used                                                                                                        |
| 5f  | waitFor             | na      | Not used                                                                                                        |
| 5g  | fs operations       | pass    | Uses `next.testDir` for `.next/server` path — isolated-safe                                                     |
| 6a  | Fixtures exist      | pass    | pages/[[...slug]].js + next.config.js present                                                                   |
| 6b  | next.config.js      | pass    | Copied from original                                                                                            |
| 6c  | Overrides           | na      | None used                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                 |
| 7b  | retry over timeout  | pass    |                                                                                                                 |
| 7c  | async/await         | pass    |                                                                                                                 |
| 7d  | eslint              | pass    |                                                                                                                 |

## Issues

None

## Warnings

- SSR test makes two requests (one for status check via `next.fetch`, one via `next.render$`) vs. original's single request — no coverage loss, minor duplication.
- After `browser.back()`, original had a redundant `expect` outside the `check()` asserting the same value; converted version covers it only inside `retry()`. Functionally equivalent.
