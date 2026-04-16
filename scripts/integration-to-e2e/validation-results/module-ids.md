# module-ids: WARN

Conversion preserves all tests, assertions, and fixtures, but uses the anti-pattern of calling `nextTestSetup()` inside describes that then early-return with a placeholder `it('skipped')`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                                 |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 8, converted: 8 (+2 placeholder "skipped" tests)                                                                                                                                           |
| 1b  | Assertions          | pass    | original: 14, converted: 14                                                                                                                                                                          |
| 1c  | Test titles         | pass    | All 8 preserved verbatim                                                                                                                                                                             |
| 1d  | Describe blocks     | pass    | `minified module ids` > `production mode` / `development mode` preserved                                                                                                                             |
| 2a  | URL paths           | pass    | `/` rendered in dev setup                                                                                                                                                                            |
| 2b  | Response checks     | pass    | All bundle content assertions preserved                                                                                                                                                              |
| 2c  | FS checks           | pass    | Dist bundle reads preserved using `next.testDir`                                                                                                                                                     |
| 2d  | Browser checks      | na      |                                                                                                                                                                                                      |
| 2e  | Build output        | pass    | Implicit via nextTestSetup build                                                                                                                                                                     |
| 2f  | Dynamic logic       | pass    | Split into isNextStart / isNextDev guarded describes                                                                                                                                                 |
| 3a  | nextTestSetup       | pass    | Used in both describes                                                                                                                                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                                   |
| 3c  | skipStart           | na      | Both modes need a running app/build                                                                                                                                                                  |
| 3d  | No manual lifecycle | pass    | No launchApp/killApp/nextBuild imports                                                                                                                                                               |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                                                                             |
| 4a  | Directory placement | warn    | Single file in `test/e2e/` runs both modes — could split prod case to `test/production/` since it doesn't need a running server, but current placement works                                         |
| 4b  | Mode guards         | warn    | Uses `if (!isNextStart) { it('skipped'); return }` inside describe after `nextTestSetup()` call — anti-pattern per checklist. Should wrap with `(isNextStart ? describe : describe.skip)` externally |
| 4c  | Turbopack guards    | warn    | Turbopack wrap is external (good), but the nested isNextStart/isNextDev placeholder pattern causes nextTestSetup to spin up an app even when skipping                                                |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV`/`TURBOPACK_BUILD` dedup flags are effectively replaced by `NEXT_TEST_MODE` split via isNextDev/isNextStart                                                                  |
| 4e  | No incorrect env    | pass    | Only `IS_TURBOPACK_TEST` used (top-level wrap)                                                                                                                                                       |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render('/')`                                                                                                                                                                 |
| 5b  | fetch               | na      |                                                                                                                                                                                                      |
| 5c  | browser             | na      |                                                                                                                                                                                                      |
| 5d  | check→retry         | na      |                                                                                                                                                                                                      |
| 5e  | File class          | na      |                                                                                                                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                                                                                                      |
| 5g  | fs operations       | pass    | Reads use `next.testDir` — correct isolated path; `next.readFile` impractical for directory scans                                                                                                    |
| 6a  | Fixtures exist      | pass    | pages/index.js, components/CustomComponent.tsx, module-with-long-name.js, node_modules/external-module-with-long-name.js, next.config.js all present                                                 |
| 6b  | next.config.js      | pass    | Copied to fixture directory                                                                                                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                                                                                                      |
| 7b  | retry over timeout  | na      |                                                                                                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                                                                                                      |

## Issues

None.

## Warnings

- The `if (!isNextStart) { it('skipped', () => {}); return }` / `if (!isNextDev) { ... return }` pattern sits inside describes that already called `nextTestSetup({ files: __dirname })`. Per criterion 4c, this causes the test harness to spin up an isolated app for the irrelevant mode on every run. Better pattern: hoist the guard outside — e.g. `;(isTurbopackAndStart ? describe : describe.skip)('production mode', () => { const { next } = nextTestSetup(...) })` — or split the production-mode describe into a dedicated file under `test/production/module-ids/` that uses `skipStart` only where applicable.
- Consider whether the production-mode half belongs in `test/production/` since it only needs the build output, not a running server.
