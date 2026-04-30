# config-promise-error: WARN

Conversion preserves the single test case and assertion, but uses an inside-setup `isNextStart` guard pattern that runs `nextTestSetup()` unnecessarily when skipped.

## Criteria

| #   | Criterion           | Verdict | Note                                                                       |
| --- | ------------------- | ------- | -------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 (plus a placeholder skip stub)                   |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                  |
| 1c  | Test titles         | pass    | "should warn when a promise is returned on webpack" preserved              |
| 1d  | Describe blocks     | pass    | Outer + inner describe nesting preserved                                   |
| 2a  | URL paths           | na      | Build-only test, no HTTP                                                   |
| 2b  | Response checks     | na      |                                                                            |
| 2c  | FS checks           | pass    | `fs.writeFile` → `next.patchFile`                                          |
| 2d  | Browser checks      | na      |                                                                            |
| 2e  | Build output        | pass    | `nextBuild` stderr+stdout → `next.build()` + `next.cliOutput`              |
| 2f  | Dynamic logic       | na      |                                                                            |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                      |
| 3b  | files param         | pass    | `files: __dirname`                                                         |
| 3c  | skipStart           | pass    | `skipStart: true` set, `next.build()` called explicitly                    |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`launchApp` imports                                         |
| 3e  | Cleanup             | pass    | Isolated dir — no afterEach needed                                         |
| 4a  | Directory placement | pass    | `test/production/` appropriate for build-only test                         |
| 4b  | Mode guards         | warn    | Inner `isNextStart` check runs after `nextTestSetup` — anti-pattern per 4c |
| 4c  | Turbopack guards    | pass    | Outer `IS_TURBOPACK_TEST ? describe.skip` wraps `nextTestSetup` correctly  |
| 4d  | Dedup guards        | na      |                                                                            |
| 4e  | No incorrect env    | pass    |                                                                            |
| 5a  | render              | na      |                                                                            |
| 5b  | fetch               | na      |                                                                            |
| 5c  | browser             | na      |                                                                            |
| 5d  | check→retry         | na      |                                                                            |
| 5e  | File class          | na      |                                                                            |
| 5f  | waitFor             | na      |                                                                            |
| 5g  | fs operations       | pass    | `fs.writeFile(appDir…)` → `next.patchFile`                                 |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                                   |
| 6b  | next.config.js      | pass    | Test creates it at runtime via patchFile, matching original                |
| 6c  | Overrides           | na      |                                                                            |
| 7a  | No dead code        | warn    | `it('skipped for non-start mode', () => {})` stub is a code smell          |
| 7b  | retry over timeout  | na      |                                                                            |
| 7c  | async/await         | pass    |                                                                            |
| 7d  | eslint              | pass    |                                                                            |

## Issues

None.

## Warnings

- The `if (!isNextStart) { it('skipped…'); return }` pattern sits inside the describe that already called `nextTestSetup()`, causing setup to run even when skipped. Since this file lives in `test/production/`, the `isNextStart` guard is effectively always true and could be removed entirely.
- The original `TURBOPACK_DEV` inner guard was flattened into the single `IS_TURBOPACK_TEST` outer wrap — acceptable simplification, but worth noting.
