# production-nav: PASS

Conversion preserves the single production-mode navigation test, replaces `waitFor(2000)` with `retry()`, and fixtures are intact.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                            |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 (plus harmless placeholder)                                                                                           |
| 1b  | Assertions          | pass    | original: 2, converted: 4 (added retry-based assertions)                                                                                        |
| 1c  | Test titles         | pass    | "should navigate forward and back correctly" preserved                                                                                          |
| 1d  | Describe blocks     | pass    | `Production Usage` > `production mode` preserved                                                                                                |
| 2a  | URL paths           | pass    | `/` navigated, `#to-another`/`#to-index` links used                                                                                             |
| 2b  | Response checks     | pass    | `window.beforeNav` assertions preserved                                                                                                         |
| 2c  | FS checks           | na      |                                                                                                                                                 |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`; selectors identical                                                                                               |
| 2e  | Build output        | na      |                                                                                                                                                 |
| 2f  | Dynamic logic       | na      |                                                                                                                                                 |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                 |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                              |
| 3c  | skipStart           | na      | server-start test                                                                                                                               |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                 |
| 3e  | Cleanup             | pass    | handled by nextTestSetup                                                                                                                        |
| 4a  | Directory placement | pass    | `test/production/` matches production-only original                                                                                             |
| 4b  | Mode guards         | pass    | `isNextStart` used                                                                                                                              |
| 4c  | Turbopack guards    | warn    | `if (!isNextStart) { it('skipped'); return }` runs nextTestSetup unnecessarily; since dir is `test/production/`, `isNextStart` is always true   |
| 4d  | Dedup guards        | warn    | Original had `process.env.TURBOPACK_DEV` skip; not reproduced. Likely unnecessary since test/production/ only runs start mode, but worth noting |
| 4e  | No incorrect env    | pass    |                                                                                                                                                 |
| 5a  | render              | na      |                                                                                                                                                 |
| 5b  | fetch               | na      |                                                                                                                                                 |
| 5c  | browser             | pass    |                                                                                                                                                 |
| 5d  | check→retry         | na      |                                                                                                                                                 |
| 5e  | File class          | na      |                                                                                                                                                 |
| 5f  | waitFor             | pass    | replaced with `retry()` polling on element presence                                                                                             |
| 5g  | fs operations       | na      |                                                                                                                                                 |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `pages/another.js`, `next.config.js`                                                                                          |
| 6b  | next.config.js      | pass    | copied                                                                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                                                 |
| 7a  | No dead code        | pass    |                                                                                                                                                 |
| 7b  | retry over timeout  | pass    |                                                                                                                                                 |
| 7c  | async/await         | pass    |                                                                                                                                                 |
| 7d  | eslint              | pass    |                                                                                                                                                 |

## Issues

None

## Warnings

- Unnecessary `if (!isNextStart) { it('skipped', ...); return }` inside describe that already calls `nextTestSetup()` — since the file is under `test/production/`, `isNextStart` is always true. Pattern mildly violates 4c guidance.
- Original's `process.env.TURBOPACK_DEV` dedup guard not carried over; acceptable because the converted suite only runs in start mode, so no redundant run occurs.
