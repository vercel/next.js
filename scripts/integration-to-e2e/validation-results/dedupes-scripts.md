# dedupes-scripts: PASS

Conversion is clean and preserves the single test case, with fixtures intact.

## Criteria

| #   | Criterion           | Verdict | Note                                                                             |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                        |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                        |
| 1c  | Test titles         | pass    | "Does not have duplicate script references" preserved                            |
| 1d  | Describe blocks     | pass    | Nested describes flattened to single `dedupes-scripts` describe                  |
| 2a  | URL paths           | pass    | `/` rendered via `next.render$`                                                  |
| 2b  | Response checks     | pass    | script-src dedup logic preserved exactly                                         |
| 2c  | FS checks           | na      |                                                                                  |
| 2d  | Browser checks      | na      |                                                                                  |
| 2e  | Build output        | na      |                                                                                  |
| 2f  | Dynamic logic       | na      |                                                                                  |
| 3a  | nextTestSetup       | pass    |                                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                               |
| 3c  | skipStart           | na      | Needs server, not build-only                                                     |
| 3d  | No manual lifecycle | pass    |                                                                                  |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                         |
| 4a  | Directory placement | pass    | `test/production/` matches prod-only original                                    |
| 4b  | Mode guards         | na      |                                                                                  |
| 4c  | Turbopack guards    | na      | Original skip was for `TURBOPACK_DEV` which does not apply in `test/production/` |
| 4d  | Dedup guards        | pass    | `TURBOPACK_DEV` skip is moot in prod dir; no dedup needed                        |
| 4e  | No incorrect env    | pass    |                                                                                  |
| 5a  | render              | pass    | `renderViaHTTP` + `cheerio.load` → `next.render$`                                |
| 5b  | fetch               | na      |                                                                                  |
| 5c  | browser             | na      |                                                                                  |
| 5d  | check→retry         | na      |                                                                                  |
| 5e  | File class          | na      |                                                                                  |
| 5f  | waitFor             | na      |                                                                                  |
| 5g  | fs operations       | na      |                                                                                  |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `components/hello.js` present                                  |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                   |
| 6c  | Overrides           | na      |                                                                                  |
| 7a  | No dead code        | pass    |                                                                                  |
| 7b  | retry over timeout  | pass    |                                                                                  |
| 7c  | async/await         | pass    |                                                                                  |
| 7d  | eslint              | pass    |                                                                                  |

## Issues

None

## Warnings

None
