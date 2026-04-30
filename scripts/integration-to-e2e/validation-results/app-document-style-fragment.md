# app-document-style-fragment: PASS

Clean 1:1 conversion — single production test with identical assertions, fixtures carried over intact.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                     |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                |
| 1c  | Test titles         | pass    | Title preserved verbatim                                                                 |
| 1d  | Describe blocks     | pass    | Inner production-mode describe flattened (appropriate since file is in test/production/) |
| 2a  | URL paths           | pass    | `/` rendered via `next.render$`                                                          |
| 2b  | Response checks     | pass    | Both style regex assertions preserved                                                    |
| 2c  | FS checks           | na      |                                                                                          |
| 2d  | Browser checks      | na      |                                                                                          |
| 2e  | Build output        | na      |                                                                                          |
| 2f  | Dynamic logic       | na      |                                                                                          |
| 3a  | nextTestSetup       | pass    |                                                                                          |
| 3b  | files param         | pass    | `files: __dirname`                                                                       |
| 3c  | skipStart           | na      | Test needs server rendering                                                              |
| 3d  | No manual lifecycle | pass    | No startApp/nextBuild/etc.                                                               |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                 |
| 4a  | Directory placement | pass    | test/production/ matches original prod-only                                              |
| 4b  | Mode guards         | na      |                                                                                          |
| 4c  | Turbopack guards    | na      | Original TURBOPACK_DEV guard was dedup — placement in test/production/ handles this      |
| 4d  | Dedup guards        | pass    | Placement-based dedup (prod dir)                                                         |
| 4e  | No incorrect env    | pass    |                                                                                          |
| 5a  | render              | pass    | `renderViaHTTP` + `cheerio.load` → `next.render$`                                        |
| 5b  | fetch               | na      |                                                                                          |
| 5c  | browser             | na      |                                                                                          |
| 5d  | check→retry         | na      |                                                                                          |
| 5e  | File class          | na      |                                                                                          |
| 5f  | waitFor             | na      |                                                                                          |
| 5g  | fs operations       | na      |                                                                                          |
| 6a  | Fixtures exist      | pass    | pages/\_document.js, pages/index.js present                                              |
| 6b  | next.config.js      | na      | Original had none                                                                        |
| 6c  | Overrides           | na      |                                                                                          |
| 7a  | No dead code        | pass    |                                                                                          |
| 7b  | retry over timeout  | na      |                                                                                          |
| 7c  | async/await         | pass    |                                                                                          |
| 7d  | eslint              | pass    |                                                                                          |

## Issues

None

## Warnings

None
