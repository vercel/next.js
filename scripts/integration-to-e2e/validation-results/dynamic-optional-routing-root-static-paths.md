# dynamic-optional-routing-root-static-paths: PASS

Clean conversion preserving all 3 tests with equivalent behavior using nextTestSetup.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                               |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3 (via runTests x2 modes = 6 invocations), converted: 3 (e2e runs both modes)                                                            |
| 1b  | Assertions          | pass    | original: 3 per run, converted: 3                                                                                                                  |
| 1c  | Test titles         | pass    | All three titles preserved verbatim                                                                                                                |
| 1d  | Describe blocks     | pass    | Dev/prod describes collapsed — e2e runs both modes                                                                                                 |
| 2a  | URL paths           | pass    | `/`, `/one`, `/one/two` all covered                                                                                                                |
| 2b  | Response checks     | pass    | `$('#success').text()` assertions preserved                                                                                                        |
| 2c  | FS checks           | na      | Original only reads next.config.js conditionally                                                                                                   |
| 2d  | Browser checks      | na      |                                                                                                                                                    |
| 2e  | Build output        | na      |                                                                                                                                                    |
| 2f  | Dynamic logic       | pass    | runTests() inlined; no divergent dev/prod behavior                                                                                                 |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                 |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                     |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/etc                                                                                                                            |
| 3e  | Cleanup             | pass    | nextTestSetup handles it                                                                                                                           |
| 4a  | Directory placement | pass    | test/e2e/ correct (ran in both modes)                                                                                                              |
| 4b  | Mode guards         | na      | Same behavior across modes                                                                                                                         |
| 4c  | Turbopack guards    | na      | Original TURBOPACK_BUILD/TURBOPACK_DEV guards are dedup guards                                                                                     |
| 4d  | Dedup guards        | warn    | Original had dedup guards `TURBOPACK_BUILD`/`TURBOPACK_DEV`; in e2e they are effectively handled by single-mode runs, but not explicitly preserved |
| 4e  | No incorrect env    | pass    |                                                                                                                                                    |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render$`                                                                                                                   |
| 5b  | fetch               | na      |                                                                                                                                                    |
| 5c  | browser             | na      |                                                                                                                                                    |
| 5d  | check→retry         | na      |                                                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                                                                    |
| 5g  | fs operations       | pass    | Conditional next.config.js rewrite dropped (config is `module.exports = {}`, no 'target' to rewrite)                                               |
| 6a  | Fixtures exist      | pass    | `pages/[[...optionalName]].js` present                                                                                                             |
| 6b  | next.config.js      | pass    | Original was empty `module.exports = {}`; absence in fixture is equivalent                                                                         |
| 6c  | Overrides           | na      |                                                                                                                                                    |
| 7a  | No dead code        | pass    |                                                                                                                                                    |
| 7b  | retry over timeout  | pass    |                                                                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                                                                    |

## Issues

None

## Warnings

- Original had `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards (skip dev describe if TURBOPACK_BUILD, skip prod describe if TURBOPACK_DEV). The converted test does not preserve these, meaning this test may run in all 4 CI mode combinations instead of 2. Since the fix would be identical behavior in both modes, impact is only duplicate CI runs.
