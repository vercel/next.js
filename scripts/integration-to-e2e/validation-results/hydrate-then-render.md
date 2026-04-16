# hydrate-then-render: PASS

Single-test conversion preserved correctly, with one minor unnecessary guard.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                            |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 real test; converted: 1 real + 1 skip stub                                                          |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                                       |
| 1c  | Test titles         | pass    | "correctly measures hydrate followed by render" preserved                                                       |
| 1d  | Describe blocks     | pass    | both describe layers preserved                                                                                  |
| 2a  | URL paths           | pass    | `/` via browser preserved                                                                                       |
| 2b  | Response checks     | pass    | beacon matchObject preserved                                                                                    |
| 2c  | FS checks           | na      |                                                                                                                 |
| 2d  | Browser checks      | pass    | waitForElementByCss/click/eval identical                                                                        |
| 2e  | Build output        | na      |                                                                                                                 |
| 2f  | Dynamic logic       | na      |                                                                                                                 |
| 3a  | nextTestSetup       | pass    | uses `nextTestSetup` from `'e2e-utils'`                                                                         |
| 3b  | files param         | pass    | `files: __dirname`                                                                                              |
| 3c  | skipStart           | na      | browser test, start needed                                                                                      |
| 3d  | No manual lifecycle | pass    | no findPort/killApp/nextBuild/nextStart                                                                         |
| 3e  | Cleanup             | pass    | handled by nextTestSetup                                                                                        |
| 4a  | Directory placement | pass    | `test/production/` matches prod-only original                                                                   |
| 4b  | Mode guards         | pass    | isNextStart guard present (redundant but safe)                                                                  |
| 4c  | Turbopack guards    | warn    | original skipped for TURBOPACK_DEV; converted drops it (fine since in test/production/)                         |
| 4d  | Dedup guards        | na      |                                                                                                                 |
| 4e  | No incorrect env    | pass    |                                                                                                                 |
| 5a  | render              | na      |                                                                                                                 |
| 5b  | fetch               | na      |                                                                                                                 |
| 5c  | browser             | pass    | `webdriver(port,'/')` → `next.browser('/')`                                                                     |
| 5d  | check→retry         | na      |                                                                                                                 |
| 5e  | File class          | na      |                                                                                                                 |
| 5f  | waitFor             | na      |                                                                                                                 |
| 5g  | fs operations       | na      |                                                                                                                 |
| 6a  | Fixtures exist      | pass    | pages/\_app.js, index.js, other.js present                                                                      |
| 6b  | next.config.js      | na      | none in original either                                                                                         |
| 6c  | Overrides           | na      |                                                                                                                 |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped'...); return }` is dead in `test/production/` since isNextStart is always true |
| 7b  | retry over timeout  | na      |                                                                                                                 |
| 7c  | async/await         | pass    |                                                                                                                 |
| 7d  | eslint              | pass    |                                                                                                                 |

## Issues

None

## Warnings

- The `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` guard is unnecessary inside `test/production/` (isNextStart is always true). Harmless but dead code — could be removed for cleanliness.
- Original's `process.env.TURBOPACK_DEV ? describe.skip` dedup guard is not reproduced, but this is inherent to the directory move into `test/production/` which only runs in start mode.
