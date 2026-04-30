# preview-fallback: WARN

Conversion preserves all tests and assertions correctly; only nit is using raw `fs` instead of `next.readFile()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                 |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 6 (run 2x dev/prod), converted: 6                                                          |
| 1b  | Assertions          | pass    | Matches or exceeds original                                                                          |
| 1c  | Test titles         | pass    | All 6 titles preserved verbatim                                                                      |
| 1d  | Describe blocks     | pass    | dev/prod describes flattened, handled by nextTestSetup mode                                          |
| 2a  | URL paths           | pass    | All paths preserved via next.render/fetch/browser                                                    |
| 2b  | Response checks     | pass    | Status 404 check, props equality, cookies all preserved                                              |
| 2c  | FS checks           | warn    | Uses raw fs.readFileSync on next.testDir instead of next.readFile()                                  |
| 2d  | Browser checks      | pass    | next.browser + elementByCss preserved                                                                |
| 2e  | Build output        | na      |                                                                                                      |
| 2f  | Dynamic logic       | pass    | `!isDev` branches mapped to `isNextStart` guards                                                     |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                                   |
| 3c  | skipStart           | na      | Not build-only                                                                                       |
| 3d  | No manual lifecycle | pass    |                                                                                                      |
| 3e  | Cleanup             | pass    | No manual cleanup needed                                                                             |
| 4a  | Directory placement | pass    | Ran in both dev/prod originally → test/e2e/ correct                                                  |
| 4b  | Mode guards         | pass    | `isNextStart` guards replace `!isDev`                                                                |
| 4c  | Turbopack guards    | na      | Original only used TURBOPACK\_\* for dedup, not skip                                                 |
| 4d  | Dedup guards        | pass    | Handled implicitly by nextTestSetup mode routing                                                     |
| 4e  | No incorrect env    | pass    |                                                                                                      |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                          |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                            |
| 5c  | browser             | pass    | webdriver → next.browser                                                                             |
| 5d  | check→retry         | pass    | Both check() calls converted to retry() + expect()                                                   |
| 5e  | File class          | na      |                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                      |
| 5g  | fs operations       | warn    | Uses raw fs on next.testDir; next.readFile()/next.hasFile() preferred                                |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/api/{enable,disable}.js, pages/fallback/[post].js, pages/no-fallback/[post].js |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                       |
| 6c  | Overrides           | na      |                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                      |
| 7b  | retry over timeout  | pass    |                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                      |

## Issues

None

## Warnings

- `fs.readFileSync`/`fs.existsSync` on `next.testDir` could be replaced with `next.readFile()`/`next.hasFile()` per guidelines (minor; current approach still works since it targets the isolated test dir).
