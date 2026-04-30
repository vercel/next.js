# route-load-cancel-css: WARN

Conversion preserves behavior but creates a duplicate nested test file/fixture set and uses the anti-pattern `if (!isNextStart) return` inside a describe with `nextTestSetup()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                 |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 2 (1 in each file — duplicate)                                                                                                               |
| 1b  | Assertions          | pass    | original: 3, converted outer: 3, nested: 2                                                                                                                           |
| 1c  | Test titles         | pass    | Title preserved in both converted files                                                                                                                              |
| 1d  | Describe blocks     | warn    | Nested file drops the `production mode` describe layer                                                                                                               |
| 2a  | URL paths           | pass    | `/` browsed in both                                                                                                                                                  |
| 2b  | Response checks     | pass    | Element text + `window.routeCancelled` preserved                                                                                                                     |
| 2c  | FS checks           | na      |                                                                                                                                                                      |
| 2d  | Browser checks      | pass    | webdriver→next.browser with equivalent selectors                                                                                                                     |
| 2e  | Build output        | na      |                                                                                                                                                                      |
| 2f  | Dynamic logic       | na      | Original only ran production mode                                                                                                                                    |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                      |
| 3b  | files param         | pass    | `files: __dirname` in both                                                                                                                                           |
| 3c  | skipStart           | na      | Start-mode test, not build-only                                                                                                                                      |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                      |
| 3e  | Cleanup             | pass    |                                                                                                                                                                      |
| 4a  | Directory placement | pass    | test/production/ matches original prod-only coverage                                                                                                                 |
| 4b  | Mode guards         | warn    | Outer uses `if (!isNextStart) { it('skipped'); return }` after `nextTestSetup()` — anti-pattern per 4c guidance (harmless here since production dir is always start) |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV` guard correctly dropped (that env var is deprecated per 4e)                                                                                 |
| 4d  | Dedup guards        | na      |                                                                                                                                                                      |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` usage                                                                                                                           |
| 5a  | render              | na      |                                                                                                                                                                      |
| 5b  | fetch               | na      |                                                                                                                                                                      |
| 5c  | browser             | pass    |                                                                                                                                                                      |
| 5d  | check→retry         | na      | Original had none; nested adds retry (improvement)                                                                                                                   |
| 5e  | File class          | na      |                                                                                                                                                                      |
| 5f  | waitFor             | warn    | Both converted retain `waitFor(3000)`/`waitFor(5000)` for timing; acceptable given test simulates slow page loads, but outer file could use retry()                  |
| 5g  | fs operations       | na      |                                                                                                                                                                      |
| 6a  | Fixtures exist      | pass    | pages/index.js, page1.js, page1.module.css, page2.js present in both fixture dirs                                                                                    |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                                    |
| 6c  | Overrides           | na      |                                                                                                                                                                      |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped'); return }` is dead in test/production                                                                                             |
| 7b  | retry over timeout  | warn    | Outer file uses raw `waitFor(3000)` rather than retry()                                                                                                              |
| 7c  | async/await         | pass    |                                                                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                                                                      |

## Issues

None that drop coverage.

## Warnings

- **Duplicate converted file/fixture pair**: `test/production/route-load-cancel-css/route-load-cancel-css.test.ts` and `test/production/route-load-cancel-css/route-load-cancel-css/route-load-cancel-css.test.ts` both exist with their own `pages/` fixtures. One should be removed.
- Outer file uses the anti-pattern `if (!isNextStart) { it('skipped'); return }` inside a describe that already called `nextTestSetup()` — placement in `test/production/` makes the guard unreachable/dead.
- Outer file keeps `waitFor(3000)` pauses; consider `retry()` where feasible (nested file already does).
- Nested converted file drops the `production mode` describe layer from the original hierarchy.
