# render-error-on-top-level-error: PASS

Clean conversion: both original test files are consolidated into a single prod-only suite with fixtures mirrored and browser assertions preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                         |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2 real + 2 defensive `skipped` placeholders          |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                    |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                               |
| 1d  | Describe blocks     | pass    | Added inner describes for each fixture                                       |
| 2a  | URL paths           | pass    | `/` in both                                                                  |
| 2b  | Response checks     | pass    | `#error-p` text assertions preserved                                         |
| 2c  | FS checks           | na      |                                                                              |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`                                                 |
| 2e  | Build output        | na      |                                                                              |
| 2f  | Dynamic logic       | na      |                                                                              |
| 3a  | nextTestSetup       | pass    |                                                                              |
| 3b  | files param         | pass    | `join(__dirname, 'with-get-initial-props')` etc.                             |
| 3c  | skipStart           | na      | Tests exercise the running server                                            |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`startApp` etc.                                               |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                     |
| 4a  | Directory placement | pass    | `test/production/` matches prod-only original                                |
| 4b  | Mode guards         | pass    | `isNextStart` used defensively                                               |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV` guard not needed — test/production forces prod mode |
| 4d  | Dedup guards        | na      |                                                                              |
| 4e  | No incorrect env    | pass    |                                                                              |
| 5a  | render              | na      |                                                                              |
| 5b  | fetch               | na      |                                                                              |
| 5c  | browser             | pass    |                                                                              |
| 5d  | check→retry         | na      |                                                                              |
| 5e  | File class          | na      |                                                                              |
| 5f  | waitFor             | na      | `waitForElementByCss` is a browser helper, not setTimeout                    |
| 5g  | fs operations       | na      |                                                                              |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `pages/_error.js` present in both fixture dirs             |
| 6b  | next.config.js      | na      | Original had none                                                            |
| 6c  | Overrides           | na      |                                                                              |
| 7a  | No dead code        | pass    |                                                                              |
| 7b  | retry over timeout  | pass    |                                                                              |
| 7c  | async/await         | pass    |                                                                              |
| 7d  | eslint              | pass    |                                                                              |

## Issues

None

## Warnings

- The `if (!isNextStart) { it('skipped'...); return }` guards inside `describe` blocks are redundant since the file is in `test/production/` (start mode only). They don't spin up the app unnecessarily (nextTestSetup is already called above them), but they add two noisy placeholder tests. Consider removing the guards entirely.
