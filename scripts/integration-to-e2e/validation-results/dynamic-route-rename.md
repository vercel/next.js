# dynamic-route-rename: WARN

Conversion preserves test structure and coverage, but the negative-assertion `retry()` replacement for `waitFor(2000)` passes instantly, weakening the original's 2-second wait for the dev server to pick up the rename.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                                                           |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                                                                           |
| 1c  | Test titles         | pass    | Title preserved verbatim                                                                                                                            |
| 1d  | Describe blocks     | pass    | Single describe preserved                                                                                                                           |
| 2a  | URL paths           | pass    | `/abc` preserved                                                                                                                                    |
| 2b  | Response checks     | pass    | `toContain('hi')` preserved                                                                                                                         |
| 2c  | FS checks           | pass    | `fs.rename` → `next.renameFile`                                                                                                                     |
| 2d  | Browser checks      | na      |                                                                                                                                                     |
| 2e  | Build output        | na      |                                                                                                                                                     |
| 2f  | Dynamic logic       | na      |                                                                                                                                                     |
| 3a  | nextTestSetup       | pass    | From 'e2e-utils'                                                                                                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                  |
| 3c  | skipStart           | na      | Dev server test                                                                                                                                     |
| 3d  | No manual lifecycle | pass    | No `launchApp`/`killApp`                                                                                                                            |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                            |
| 4a  | Directory placement | pass    | `test/development/` matches original launched with `launchApp` (dev)                                                                                |
| 4b  | Mode guards         | na      | Dev-only                                                                                                                                            |
| 4c  | Turbopack guards    | na      |                                                                                                                                                     |
| 4d  | Dedup guards        | na      |                                                                                                                                                     |
| 4e  | No incorrect env    | pass    |                                                                                                                                                     |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                                     |
| 5b  | fetch               | na      |                                                                                                                                                     |
| 5c  | browser             | na      |                                                                                                                                                     |
| 5d  | check→retry         | na      | No `check()` in original                                                                                                                            |
| 5e  | File class          | na      |                                                                                                                                                     |
| 5f  | waitFor             | warn    | `waitFor(2000)` replaced with `retry()` on negative assertion — retry passes immediately and does not wait for the dev server to process the rename |
| 5g  | fs operations       | pass    | Uses `next.renameFile`, no raw `fs`                                                                                                                 |
| 6a  | Fixtures exist      | pass    | `pages/[pid].js` present                                                                                                                            |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                   |
| 6c  | Overrides           | na      |                                                                                                                                                     |
| 7a  | No dead code        | pass    |                                                                                                                                                     |
| 7b  | retry over timeout  | warn    | See 5f — retry here is a no-op, so the test may not reliably observe the error if it would eventually appear                                        |
| 7c  | async/await         | pass    |                                                                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                                                                     |

## Issues

None (no failing criteria).

## Warnings

- The original `waitFor(2000)` after each `fs.rename` gave the dev server time to pick up the rename and emit any slug-mismatch error. The converted `retry(async () => { expect(next.cliOutput).not.toContain(...) })` passes on the first iteration because the negative assertion is already true, so effectively zero wait occurs. Consider using `await waitFor(2000)` or a positive signal (e.g., waiting for a compile/recompile log line) before the negative assertion, to preserve the original timing guarantee.
