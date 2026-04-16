All fixtures match and test coverage is preserved.

# sharp-api: PASS

Clean 1:1 conversion — single test preserved with all assertions intact, fixtures identical, and sharp dependency correctly declared via `dependencies`.

## Criteria

| #   | Criterion           | Verdict | Note                                            |
| --- | ------------------- | ------- | ----------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                       |
| 1b  | Assertions          | pass    | original: 4, converted: 4                       |
| 1c  | Test titles         | pass    | 'should handle custom sharp usage' preserved    |
| 1d  | Describe blocks     | pass    | 'sharp api' preserved                           |
| 2a  | URL paths           | pass    | /api/custom-sharp                               |
| 2b  | Response checks     | pass    | status/content-type/body size                   |
| 2c  | FS checks           | pass    | nft.json via next.readJSON                      |
| 2d  | Browser checks      | na      |                                                 |
| 2e  | Build output        | na      |                                                 |
| 2f  | Dynamic logic       | na      |                                                 |
| 3a  | nextTestSetup       | pass    |                                                 |
| 3b  | files param         | pass    | files: \_\_dirname                              |
| 3c  | skipStart           | na      | Server needed for /api call                     |
| 3d  | No manual lifecycle | pass    |                                                 |
| 3e  | Cleanup             | pass    | nextTestSetup handles it                        |
| 4a  | Directory placement | pass    | test/production/ (prod-only build+start)        |
| 4b  | Mode guards         | na      |                                                 |
| 4c  | Turbopack guards    | na      |                                                 |
| 4d  | Dedup guards        | na      |                                                 |
| 4e  | No incorrect env    | pass    |                                                 |
| 5a  | render              | na      |                                                 |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                       |
| 5c  | browser             | na      |                                                 |
| 5d  | check→retry         | na      |                                                 |
| 5e  | File class          | na      |                                                 |
| 5f  | waitFor             | na      |                                                 |
| 5g  | fs operations       | pass    | fs.readJson → next.readJSON                     |
| 6a  | Fixtures exist      | pass    | pages/api/custom-sharp.js present and identical |
| 6b  | next.config.js      | na      | Original had none                               |
| 6c  | Overrides           | pass    | sharp dep via `dependencies` option             |
| 7a  | No dead code        | pass    |                                                 |
| 7b  | retry over timeout  | na      |                                                 |
| 7c  | async/await         | pass    |                                                 |
| 7d  | eslint              | pass    |                                                 |

## Issues

None

## Warnings

None
