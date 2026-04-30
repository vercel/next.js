# invalid-page-automatic-static-optimization: PASS

Both tests preserved with equivalent assertions; fixture transformations adapted for isolated test directory using patch/delete helpers.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                     |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                |
| 1b  | Assertions          | pass    | original: 5, converted: 5                                                                |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                           |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner "production mode" flattened (suite in test/production/)  |
| 2a  | URL paths           | na      | No HTTP requests                                                                         |
| 2b  | Response checks     | na      |                                                                                          |
| 2c  | FS checks           | pass    | Uses next.patchFile/deleteFile instead of raw fs on appDir                               |
| 2d  | Browser checks      | na      |                                                                                          |
| 2e  | Build output        | pass    | stderr → cliOutput via next.build()                                                      |
| 2f  | Dynamic logic       | na      |                                                                                          |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from 'e2e-utils'                                                      |
| 3b  | files param         | pass    | files: \_\_dirname                                                                       |
| 3c  | skipStart           | pass    | Build-only, skipStart: true                                                              |
| 3d  | No manual lifecycle | pass    |                                                                                          |
| 3e  | Cleanup             | pass    | Isolated dir, no cleanup needed                                                          |
| 4a  | Directory placement | pass    | test/production/ (build-only test)                                                       |
| 4b  | Mode guards         | na      |                                                                                          |
| 4c  | Turbopack guards    | pass    | Original TURBOPACK_DEV skip implicit via test/production/ placement (doesn't run in dev) |
| 4d  | Dedup guards        | na      |                                                                                          |
| 4e  | No incorrect env    | pass    |                                                                                          |
| 5a  | render              | na      |                                                                                          |
| 5b  | fetch               | na      |                                                                                          |
| 5c  | browser             | na      |                                                                                          |
| 5d  | check→retry         | na      |                                                                                          |
| 5e  | File class          | na      |                                                                                          |
| 5f  | waitFor             | na      |                                                                                          |
| 5g  | fs operations       | pass    | Migrated from fs-extra on appDir to next.patchFile/deleteFile                            |
| 6a  | Fixtures exist      | pass    | pages/{invalid,also-invalid,valid,also-valid}.js present                                 |
| 6b  | next.config.js      | na      | Original had none                                                                        |
| 6c  | Overrides           | na      |                                                                                          |
| 7a  | No dead code        | pass    |                                                                                          |
| 7b  | retry over timeout  | na      |                                                                                          |
| 7c  | async/await         | pass    |                                                                                          |
| 7d  | eslint              | pass    |                                                                                          |

## Issues

None

## Warnings

- Test 2 approach differs slightly: original renamed the entire `pages/` dir so only `[slug].js` existed during the second build; converted keeps `valid.js`/`also-valid.js` (patched to valid default exports) and deletes `invalid.js`/`also-invalid.js`. Net effect is equivalent for the assertions (`/invalid API token/` present, `/without a React Component/` absent), since remaining pages have valid default exports.
