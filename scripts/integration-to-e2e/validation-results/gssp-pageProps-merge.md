# gssp-pageProps-merge: PASS

Clean conversion preserving both tests, fixtures, and dedup guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                          |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                                     |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                                     |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                                |
| 1d  | Describe blocks     | pass    | Outer describe preserved; dev/prod sub-blocks flattened (handled by nextTestSetup)                                            |
| 2a  | URL paths           | pass    | /gssp and /gsp both covered                                                                                                   |
| 2b  | Response checks     | pass    | Same JSON.parse($('p').text()) assertions                                                                                     |
| 2c  | FS checks           | na      |                                                                                                                               |
| 2d  | Browser checks      | na      |                                                                                                                               |
| 2e  | Build output        | na      |                                                                                                                               |
| 2f  | Dynamic logic       | pass    | runTests() inlined; both dev/prod covered via nextTestSetup                                                                   |
| 3a  | nextTestSetup       | pass    |                                                                                                                               |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                            |
| 3c  | skipStart           | na      | Runs in both modes                                                                                                            |
| 3d  | No manual lifecycle | pass    |                                                                                                                               |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                      |
| 4a  | Directory placement | pass    | test/e2e/ correct for dev+prod                                                                                                |
| 4b  | Mode guards         | na      | Same behavior both modes                                                                                                      |
| 4c  | Turbopack guards    | na      |                                                                                                                               |
| 4d  | Dedup guards        | pass    | TURBOPACK_DEV/BUILD dedup preserved                                                                                           |
| 4e  | No incorrect env    | warn    | Uses TURBOPACK_DEV/BUILD combined with isNextDev/isNextStart — matches original intent and the documented dedup guard pattern |
| 5a  | render              | pass    | renderViaHTTP + cheerio → next.render$                                                                                        |
| 5b  | fetch               | na      |                                                                                                                               |
| 5c  | browser             | na      |                                                                                                                               |
| 5d  | check→retry         | na      |                                                                                                                               |
| 5e  | File class          | na      |                                                                                                                               |
| 5f  | waitFor             | na      |                                                                                                                               |
| 5g  | fs operations       | na      |                                                                                                                               |
| 6a  | Fixtures exist      | pass    | pages/\_app.js, pages/gsp.js, pages/gssp.js present                                                                           |
| 6b  | next.config.js      | na      | Original has no next.config.js                                                                                                |
| 6c  | Overrides           | na      |                                                                                                                               |
| 7a  | No dead code        | pass    |                                                                                                                               |
| 7b  | retry over timeout  | na      |                                                                                                                               |
| 7c  | async/await         | pass    |                                                                                                                               |
| 7d  | eslint              | pass    |                                                                                                                               |

## Issues

None

## Warnings

None — the TURBOPACK_DEV/BUILD usage is the documented dedup-guard pattern, not a skip hack.
