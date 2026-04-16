# repeated-slashes: PASS

Faithful conversion of all 12 tests across four mode×config variations; uses `nextTestSetup`, `next.patchFile`/`deleteFile`, and `retry()` correctly. Minor redundancy in dev-mode guard patterns but behavior is preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                   |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 12 it() in runTests, converted: 12                                                           |
| 1b  | Assertions          | pass    | Count comparable; all original expects preserved (some added port-branch wrappers)                     |
| 1c  | Test titles         | pass    | All 12 titles preserved verbatim                                                                       |
| 1d  | Describe blocks     | pass    | `404 handling > custom _error/pages/404 > server/export` preserved                                     |
| 2a  | URL paths           | pass    | All tested paths preserved via next.fetch/browser or fetchViaHTTP+webdriver with static port           |
| 2b  | Response checks     | pass    | Status/headers/body assertions all preserved                                                           |
| 2c  | FS checks           | na      | No FS assertions                                                                                       |
| 2d  | Browser checks      | pass    | All browser.eval calls preserved                                                                       |
| 2e  | Build output        | na      | No build assertions                                                                                    |
| 2f  | Dynamic logic       | pass    | `isDev` passed via `isNextDev`; export mode gated by `isNextStart`                                     |
| 3a  | nextTestSetup       | pass    | Used in all four describes                                                                             |
| 3b  | files param         | pass    | `path.join(__dirname, 'app')` — real fixture directory                                                 |
| 3c  | skipStart           | pass    | Used for export mode and pages/404 (to patch files before start)                                       |
| 3d  | No manual lifecycle | pass    | `startStaticServer`/`stopApp` allowed for export static server                                         |
| 3e  | Cleanup             | pass    | Static server stopped in afterAll; file mutations isolated per nextTestSetup                           |
| 4a  | Directory placement | pass    | test/e2e/ — covers both dev and start                                                                  |
| 4b  | Mode guards         | pass    | `isNextStart ? describe : describe.skip` for export; `isDev: isNextDev` passed through                 |
| 4c  | Turbopack guards    | na      | Original only skipped production-mode-wide via TURBOPACK_DEV; covered by isNextStart gating            |
| 4d  | Dedup guards        | na      | Original `TURBOPACK_DEV ? describe.skip` dedup not preserved, but e2e mode selection replaces its role |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD env guards                                                                      |
| 5a  | render              | na      | Original prebuild renders were ceremonial; not needed                                                  |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch` (static-server branch still uses fetchViaHTTP with port)                 |
| 5c  | browser             | pass    | `webdriver` → `next.browser` (static-server branch still uses webdriver with port)                     |
| 5d  | check→retry         | pass    | All `check()` calls replaced with `retry()` + `expect()`                                               |
| 5e  | File class          | pass    | `new File(...).write/restore` → `next.patchFile` (scoped to isolated dir)                              |
| 5f  | waitFor             | pass    | Retained only inside `didNotReload` polling loop (timing-based), appropriate                           |
| 5g  | fs operations       | pass    | `fs.move`/`fs.writeFile`/`fs.remove` → `next.deleteFile`/`next.patchFile`                              |
| 6a  | Fixtures exist      | pass    | app/next.config.js, pages/{index,another,invalid,\_error}.js present                                   |
| 6b  | next.config.js      | pass    | Present; patched for export mode via `next.patchFile`                                                  |
| 6c  | Overrides           | na      | None used                                                                                              |
| 7a  | No dead code        | warn    | `it('no-op in dev', () => {}); return` inside describe.skip branch is redundant                        |
| 7b  | retry over timeout  | pass    | retry() used for all async state polling                                                               |
| 7c  | async/await         | pass    | All promises awaited                                                                                   |
| 7d  | eslint              | pass    | No apparent violations                                                                                 |

## Issues

None.

## Warnings

- Redundant `if (isNextDev) { it('no-op in dev', () => {}); return }` blocks inside export-mode describes already wrapped with `describe.skip` in dev — the skip wrapper already handles this; the early `return` is harmless but unnecessary.
- Original's `TURBOPACK_DEV ? describe.skip` dedup guard is not replicated. Since production mode is now gated by `isNextStart`, this is functionally equivalent for the e2e runner, but a strict reviewer may want an explicit dedup guard.
