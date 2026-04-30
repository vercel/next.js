# with-electron: WARN

The converted test replaces Electron/spectron-specific behavior with standard web-based e2e tests; most navigation tests are preserved but Electron-specific checks (window count, file protocol) are necessarily dropped, and one navigation test was lost.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                                 |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | warn    | original: 5 meaningful (+1 skip-fallback), converted: 4 — "back to home page via Link" dropped                                                                                                       |
| 1b  | Assertions          | warn    | original: 5 expect(), converted: 4 expect()                                                                                                                                                          |
| 1c  | Test titles         | warn    | Dropped: "app init" (Electron-specific, acceptable), "should do back to home page via Link" (could have been preserved); added "should render the about page"                                        |
| 1d  | Describe blocks     | pass    | Nested Electron-only describes flattened appropriately                                                                                                                                               |
| 2a  | URL paths           | pass    | `/` and `/about` covered via render + browser                                                                                                                                                        |
| 2b  | Response checks     | pass    | Page content assertions preserved                                                                                                                                                                    |
| 2c  | FS checks           | na      |                                                                                                                                                                                                      |
| 2d  | Browser checks      | pass    | Equivalent Link and Router click navigation tests                                                                                                                                                    |
| 2e  | Build output        | na      |                                                                                                                                                                                                      |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                                                      |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                                                      |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                                   |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                                                                       |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                                                      |
| 3e  | Cleanup             | pass    | No external resources                                                                                                                                                                                |
| 4a  | Directory placement | pass    | test/production/ matches original's `production mode` describe                                                                                                                                       |
| 4b  | Mode guards         | na      |                                                                                                                                                                                                      |
| 4c  | Turbopack guards    | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip : describe` guard; not preserved in converted. Since placement is `test/production/`, TURBOPACK_DEV dedup is probably moot, but worth noting |
| 4d  | Dedup guards        | warn    | See 4c                                                                                                                                                                                               |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                                                      |
| 5a  | render              | pass    |                                                                                                                                                                                                      |
| 5b  | fetch               | na      |                                                                                                                                                                                                      |
| 5c  | browser             | pass    | Uses `next.browser()` with equivalent selectors                                                                                                                                                      |
| 5d  | check→retry         | na      |                                                                                                                                                                                                      |
| 5e  | File class          | na      |                                                                                                                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                                                                                                      |
| 5g  | fs operations       | na      |                                                                                                                                                                                                      |
| 6a  | Fixtures exist      | pass    | pages/index.js and pages/about.js present                                                                                                                                                            |
| 6b  | next.config.js      | warn    | Original had `basePath: outdir` (absolute Electron file path); intentionally omitted since not applicable to web, but not explicitly configured                                                      |
| 6c  | Overrides           | na      |                                                                                                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                                                                                                      |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                                                                                                      |

## Issues

None — but note this is more of a rewrite than a conversion. The original test existed solely to verify Electron file:// protocol integration (only ran with `TEST_ELECTRON=1`). The converted test is a generic Next.js navigation smoke test that no longer validates the Electron-specific integration the original suite was designed for.

## Warnings

- "should do back to home page via Link" test was dropped; it is trivially portable to the web test (click link on /about, check /home text). Consider adding.
- Electron-only "app init" (window count) assertion cannot be migrated — acceptable drop.
- Original `TURBOPACK_DEV ? describe.skip : describe` wrapper not preserved; likely unnecessary in test/production/ but worth confirming CI dedup.
- Original `basePath: outdir` next.config.js was Electron-specific; not applicable to the web test. No override needed but flagged for transparency.
