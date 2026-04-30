# no-override-next-props: PASS

Clean 1:1 conversion of a single-test dev-mode suite.

## Criteria

| #   | Criterion           | Verdict | Note                                                |
| --- | ------------------- | ------- | --------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                           |
| 1b  | Assertions          | pass    | original: 1, converted: 1                           |
| 1c  | Test titles         | pass    | Title preserved verbatim                            |
| 1d  | Describe blocks     | pass    | Single describe preserved (renamed to suite name)   |
| 2a  | URL paths           | pass    | `/` preserved                                       |
| 2b  | Response checks     | pass    | Same regex match on html                            |
| 2c  | FS checks           | na      |                                                     |
| 2d  | Browser checks      | na      |                                                     |
| 2e  | Build output        | na      |                                                     |
| 2f  | Dynamic logic       | na      |                                                     |
| 3a  | nextTestSetup       | pass    | Imports from `e2e-utils`                            |
| 3b  | files param         | pass    | `files: __dirname`                                  |
| 3c  | skipStart           | na      | Not a build-only test                               |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                       |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                            |
| 4a  | Directory placement | pass    | Original used `launchApp` (dev) → test/development/ |
| 4b  | Mode guards         | na      |                                                     |
| 4c  | Turbopack guards    | na      |                                                     |
| 4d  | Dedup guards        | na      |                                                     |
| 4e  | No incorrect env    | pass    |                                                     |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                     |
| 5b  | fetch               | na      |                                                     |
| 5c  | browser             | na      |                                                     |
| 5d  | check→retry         | na      |                                                     |
| 5e  | File class          | na      |                                                     |
| 5f  | waitFor             | na      |                                                     |
| 5g  | fs operations       | na      |                                                     |
| 6a  | Fixtures exist      | pass    | pages/\_app.js, pages/index.js present              |
| 6b  | next.config.js      | na      | None in original                                    |
| 6c  | Overrides           | na      |                                                     |
| 7a  | No dead code        | pass    |                                                     |
| 7b  | retry over timeout  | na      |                                                     |
| 7c  | async/await         | pass    |                                                     |
| 7d  | eslint              | pass    |                                                     |

## Issues

None

## Warnings

None
