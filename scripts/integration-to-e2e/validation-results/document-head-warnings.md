# document-head-warnings: PASS

Clean 1:1 conversion of 3 warning tests; fixture files identical; dev-only placement correctly replaces the original `TURBOPACK_BUILD ? describe.skip` guard.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                  |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                             |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                             |
| 1c  | Test titles         | pass    | All 3 titles identical                                                                |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner "development mode" describe flattened (dev-only file) |
| 2a  | URL paths           | pass    | `/` rendered in each test (originally rendered once in beforeAll)                     |
| 2b  | Response checks     | pass    | Regex matches on cliOutput preserved                                                  |
| 2c  | FS checks           | na      |                                                                                       |
| 2d  | Browser checks      | na      |                                                                                       |
| 2e  | Build output        | na      |                                                                                       |
| 2f  | Dynamic logic       | na      |                                                                                       |
| 3a  | nextTestSetup       | pass    | From e2e-utils                                                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                                    |
| 3c  | skipStart           | na      | Not build-only                                                                        |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp                                                         |
| 3e  | Cleanup             | pass    | nextTestSetup handles                                                                 |
| 4a  | Directory placement | pass    | test/development/ matches dev-only original                                           |
| 4b  | Mode guards         | pass    | Dev-only placement replaces TURBOPACK_BUILD skip                                      |
| 4c  | Turbopack guards    | pass    | Dev directory correctly handles original skip                                         |
| 4d  | Dedup guards        | na      |                                                                                       |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD refs                                                           |
| 5a  | render              | pass    | `next.render('/')`                                                                    |
| 5b  | fetch               | na      |                                                                                       |
| 5c  | browser             | na      |                                                                                       |
| 5d  | check→retry         | na      |                                                                                       |
| 5e  | File class          | na      |                                                                                       |
| 5f  | waitFor             | na      |                                                                                       |
| 5g  | fs operations       | na      | Uses next.cliOutput                                                                   |
| 6a  | Fixtures exist      | pass    | pages/\_document.js, pages/index.js present                                           |
| 6b  | next.config.js      | na      | Original had none                                                                     |
| 6c  | Overrides           | na      |                                                                                       |
| 7a  | No dead code        | pass    |                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                       |
| 7c  | async/await         | pass    |                                                                                       |
| 7d  | eslint              | pass    |                                                                                       |

## Issues

None.

## Warnings

None. Minor behavioral shift: each test now renders `/` rather than relying on a single shared render in `beforeAll`; this is slightly more work but semantically equivalent (cliOutput accumulates).
