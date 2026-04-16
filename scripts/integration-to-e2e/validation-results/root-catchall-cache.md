# root-catchall-cache: WARN

Conversion preserves all test logic and fixtures correctly, but contains a redundant mode-guard placeholder test that should not be needed since the suite lives in `test/production/`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                      |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | warn    | original: 1, converted: 2 (includes a redundant "skipped for non-start mode" placeholder)                                                                                                 |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                                                                                                                 |
| 1c  | Test titles         | pass    | "should cache / correctly" preserved                                                                                                                                                      |
| 1d  | Describe blocks     | pass    | "Root Catch-all Cache" > "production mode" preserved                                                                                                                                      |
| 2a  | URL paths           | pass    | `/` via renderViaHTTP → `next.render$('/')`                                                                                                                                               |
| 2b  | Response checks     | pass    | `#random` text comparisons preserved                                                                                                                                                      |
| 2c  | FS checks           | na      |                                                                                                                                                                                           |
| 2d  | Browser checks      | na      |                                                                                                                                                                                           |
| 2e  | Build output        | na      |                                                                                                                                                                                           |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                                           |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                        |
| 3c  | skipStart           | na      | starts server to test revalidation                                                                                                                                                        |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                                           |
| 3e  | Cleanup             | pass    |                                                                                                                                                                                           |
| 4a  | Directory placement | pass    | prod-only test in `test/production/`                                                                                                                                                      |
| 4b  | Mode guards         | warn    | `if (!isNextStart) { it/return }` inside describe that already called `nextTestSetup()` — unnecessary (test/production/ only runs in start mode) and violates the pattern described in 4c |
| 4c  | Turbopack guards    | warn    | Original used `TURBOPACK_DEV ? describe.skip : describe` dedup guard; converted drops this but placement in `test/production/` is appropriate                                             |
| 4d  | Dedup guards        | warn    | Original's TURBOPACK_DEV dedup guard was dropped; since this test runs build+start, it may still run under both webpack and turbopack build CI but not dev — arguably fine                |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD checks                                                                                                                                                   |
| 5a  | render              | pass    | `next.render$` used                                                                                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                                                                                           |
| 5c  | browser             | na      |                                                                                                                                                                                           |
| 5d  | check→retry         | na      |                                                                                                                                                                                           |
| 5e  | File class          | na      |                                                                                                                                                                                           |
| 5f  | waitFor             | pass    | Used for timing revalidation window (appropriate use case)                                                                                                                                |
| 5g  | fs operations       | na      |                                                                                                                                                                                           |
| 6a  | Fixtures exist      | pass    | `app/`, `next.config.js` copied over, identical to original                                                                                                                               |
| 6b  | next.config.js      | pass    | Present                                                                                                                                                                                   |
| 6c  | Overrides           | na      |                                                                                                                                                                                           |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped'...); return }` is unreachable in `test/production/`                                                                                                     |
| 7b  | retry over timeout  | pass    | waitFor is appropriate here (testing cache revalidation timing, not async state polling)                                                                                                  |
| 7c  | async/await         | pass    |                                                                                                                                                                                           |
| 7d  | eslint              | pass    |                                                                                                                                                                                           |

## Issues

None.

## Warnings

- The `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` block inside the describe is dead code: tests in `test/production/` only run in start mode, so `isNextStart` is always true. This also violates the 4c guidance about placing a skip-placeholder inside a describe that already called `nextTestSetup()`. Recommend removing it (the test will naturally only run in start mode due to its directory placement).
- Original had a `TURBOPACK_DEV` dedup guard that was dropped; directory placement handles the equivalent concern, but worth confirming the prod-only coverage is what CI expects.
