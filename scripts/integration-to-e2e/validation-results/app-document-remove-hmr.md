# app-document-remove-hmr: PASS

Clean conversion — both tests preserved with equivalent behavior using nextTestSetup, retry(), and next.patchFile/deleteFile helpers.

## Criteria

| #   | Criterion           | Verdict | Note                                                             |
| --- | ------------------- | ------- | ---------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                        |
| 1b  | Assertions          | pass    | original: 8 expect, converted: 14 expect (retry blocks expanded) |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                   |
| 1d  | Describe blocks     | pass    | Single describe preserved                                        |
| 2a  | URL paths           | pass    | `/` covered via next.browser                                     |
| 2b  | Response checks     | pass    | innerHTML assertions preserved                                   |
| 2c  | FS checks           | pass    | Uses next.readFile/patchFile/deleteFile                          |
| 2d  | Browser checks      | pass    | webdriver → next.browser with same eval                          |
| 2e  | Build output        | na      |                                                                  |
| 2f  | Dynamic logic       | na      |                                                                  |
| 3a  | nextTestSetup       | pass    |                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                               |
| 3c  | skipStart           | na      | Dev server required                                              |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                    |
| 3e  | Cleanup             | pass    | Restores index via finally; isolated copy cleans rest            |
| 4a  | Directory placement | pass    | Dev-only HMR test in test/development/                           |
| 4b  | Mode guards         | na      |                                                                  |
| 4c  | Turbopack guards    | na      |                                                                  |
| 4d  | Dedup guards        | na      |                                                                  |
| 4e  | No incorrect env    | pass    |                                                                  |
| 5a  | render              | na      |                                                                  |
| 5b  | fetch               | na      |                                                                  |
| 5c  | browser             | pass    | webdriver → next.browser                                         |
| 5d  | check→retry         | pass    | All 6 check() calls → retry()+expect()                           |
| 5e  | File class          | na      |                                                                  |
| 5f  | waitFor             | na      |                                                                  |
| 5g  | fs operations       | pass    | All via next.\* helpers                                          |
| 6a  | Fixtures exist      | pass    | pages/\_app.js, \_document.js, index.js present                  |
| 6b  | next.config.js      | na      | Original had none                                                |
| 6c  | Overrides           | na      |                                                                  |
| 7a  | No dead code        | pass    |                                                                  |
| 7b  | retry over timeout  | pass    |                                                                  |
| 7c  | async/await         | pass    |                                                                  |
| 7d  | eslint              | pass    |                                                                  |

## Issues

None

## Warnings

None
