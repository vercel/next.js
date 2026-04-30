# dynamic-require: PASS

Clean 1:1 conversion of a single-test suite to nextTestSetup with all fixtures preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                             |
| 1b  | Assertions          | pass    | original: 1, converted: 1                             |
| 1c  | Test titles         | pass    | Identical title preserved                             |
| 1d  | Describe blocks     | pass    | Single describe preserved                             |
| 2a  | URL paths           | pass    | `/` via next.render                                   |
| 2b  | Response checks     | pass    | Same regex match on HTML                              |
| 2c  | FS checks           | na      |                                                       |
| 2d  | Browser checks      | na      |                                                       |
| 2e  | Build output        | na      |                                                       |
| 2f  | Dynamic logic       | na      |                                                       |
| 3a  | nextTestSetup       | pass    | Used correctly                                        |
| 3b  | files param         | pass    | files: \_\_dirname                                    |
| 3c  | skipStart           | na      | Dev-mode test, server needed                          |
| 3d  | No manual lifecycle | pass    | No launchApp/killApp/findPort                         |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                              |
| 4a  | Directory placement | pass    | test/development/ — original only ran launchApp (dev) |
| 4b  | Mode guards         | na      |                                                       |
| 4c  | Turbopack guards    | na      |                                                       |
| 4d  | Dedup guards        | na      |                                                       |
| 4e  | No incorrect env    | pass    |                                                       |
| 5a  | render              | pass    | renderViaHTTP → next.render                           |
| 5b  | fetch               | na      |                                                       |
| 5c  | browser             | na      |                                                       |
| 5d  | check→retry         | na      |                                                       |
| 5e  | File class          | na      |                                                       |
| 5f  | waitFor             | na      |                                                       |
| 5g  | fs operations       | na      |                                                       |
| 6a  | Fixtures exist      | pass    | pages/index.js, locales/en.js, locales/ru.js present  |
| 6b  | next.config.js      | na      | Original had none                                     |
| 6c  | Overrides           | na      |                                                       |
| 7a  | No dead code        | pass    |                                                       |
| 7b  | retry over timeout  | na      |                                                       |
| 7c  | async/await         | pass    |                                                       |
| 7d  | eslint              | pass    |                                                       |

## Issues

None

## Warnings

None
