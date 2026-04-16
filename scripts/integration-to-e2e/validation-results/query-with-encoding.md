# query-with-encoding: WARN

Conversion preserves all 16 tests and assertions cleanly; only issue is a dead-code `isNextStart` guard inside a describe that already ran `nextTestSetup`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 16, converted: 16                                                                                                                                                                           |
| 1b  | Assertions          | pass    | original: 16, converted: 16                                                                                                                                                                           |
| 1c  | Test titles         | pass    | All preserved verbatim                                                                                                                                                                                |
| 1d  | Describe blocks     | pass    | Outer + production mode + 4 nested preserved                                                                                                                                                          |
| 2a  | URL paths           | pass    | All paths (`/?test=...`, `/`, `/newline`, `/space`, `/percent`, `/plus`) preserved                                                                                                                    |
| 2b  | Response checks     | pass    | Identical `expect(text).toBe(...)` assertions                                                                                                                                                         |
| 2c  | FS checks           | na      | None                                                                                                                                                                                                  |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser` with same selectors/clicks/evals                                                                                                                                         |
| 2e  | Build output        | na      | None                                                                                                                                                                                                  |
| 2f  | Dynamic logic       | na      | No runTests helper                                                                                                                                                                                    |
| 3a  | nextTestSetup       | pass    | Used with `files: __dirname`                                                                                                                                                                          |
| 3b  | files param         | pass    | `__dirname`                                                                                                                                                                                           |
| 3c  | skipStart           | na      | Server test, not build-only                                                                                                                                                                           |
| 3d  | No manual lifecycle | pass    | No legacy helpers                                                                                                                                                                                     |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                                                                              |
| 4a  | Directory placement | pass    | Original was prod-only → `test/production/` correct                                                                                                                                                   |
| 4b  | Mode guards         | warn    | `if (!isNextStart) { it('skipped'); return }` inside describe that already called `nextTestSetup` — criterion 4c explicitly flags this pattern; also dead code since test lives in `test/production/` |
| 4c  | Turbopack guards    | warn    | Original skipped on `TURBOPACK_DEV` (dedup). Converted relies on directory placement (prod-only). Acceptable but not explicit.                                                                        |
| 4d  | Dedup guards        | warn    | Original's `TURBOPACK_DEV` dedup not replicated as an explicit guard — dev-turbopack CI mode won't run test/production/ tests anyway, so effectively fine                                             |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` env checks in converted                                                                                                                                          |
| 5a  | render              | na      | Not used                                                                                                                                                                                              |
| 5b  | fetch               | na      | Not used                                                                                                                                                                                              |
| 5c  | browser             | pass    | All `webdriver(appPort, path)` → `next.browser(path)`                                                                                                                                                 |
| 5d  | check→retry         | na      | No `check()` used                                                                                                                                                                                     |
| 5e  | File class          | na      | None                                                                                                                                                                                                  |
| 5f  | waitFor             | na      | Only `waitForCondition`/`waitForElementByCss` (browser methods), not the setTimeout-based `waitFor`                                                                                                   |
| 5g  | fs operations       | na      | None                                                                                                                                                                                                  |
| 6a  | Fixtures exist      | pass    | pages/index.js, newline.js, percent.js, plus.js, space.js all present                                                                                                                                 |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                                                                     |
| 6c  | Overrides           | na      | None used                                                                                                                                                                                             |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` is dead code in `test/production/`                                                                                         |
| 7b  | retry over timeout  | pass    | Uses browser polling helpers                                                                                                                                                                          |
| 7c  | async/await         | pass    | All awaited                                                                                                                                                                                           |
| 7d  | eslint              | pass    | Clean                                                                                                                                                                                                 |

## Issues

None.

## Warnings

- `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` (line 7-10) is dead code since the test is under `test/production/` where `isNextStart` is always true. It also creates an orphaned empty test title. Remove it.
- Original used `process.env.TURBOPACK_DEV ? describe.skip : describe` as a dedup guard; converted relies implicitly on directory placement. Fine in practice, but consider adding an explicit dedup guard if the suite should also skip in `TURBOPACK_BUILD` dev-like CI configurations.
