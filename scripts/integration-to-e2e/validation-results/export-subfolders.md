# export-subfolders: PASS

Conversion preserves the single build-time test accurately with correct `skipStart` + `next.build()` lifecycle and equivalent file assertions via `next.hasFile`/`next.readFile`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                   |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                                              |
| 1b  | Assertions          | pass    | original: 6, converted: 6                                                                                                              |
| 1c  | Test titles         | pass    | Preserved verbatim                                                                                                                     |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner TURBOPACK_DEV wrapper collapsed (moved to test/production/)                                            |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                       |
| 2b  | Response checks     | na      |                                                                                                                                        |
| 2c  | FS checks           | pass    | access→hasFile, readFile→next.readFile                                                                                                 |
| 2d  | Browser checks      | na      |                                                                                                                                        |
| 2e  | Build output        | pass    | next.build() replaces nextBuild()                                                                                                      |
| 2f  | Dynamic logic       | na      |                                                                                                                                        |
| 3a  | nextTestSetup       | pass    |                                                                                                                                        |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                     |
| 3c  | skipStart           | pass    | Build-only test uses skipStart: true + beforeAll build                                                                                 |
| 3d  | No manual lifecycle | pass    |                                                                                                                                        |
| 3e  | Cleanup             | pass    |                                                                                                                                        |
| 4a  | Directory placement | pass    | test/production/ correct for build-only                                                                                                |
| 4b  | Mode guards         | na      |                                                                                                                                        |
| 4c  | Turbopack guards    | na      | Original TURBOPACK_DEV was a dedup guard, not turbopack-skip                                                                           |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_DEV ? describe.skip` dedup; since test is in test/production/ and runs via start modes only, dedup is implicit |
| 4e  | No incorrect env    | pass    |                                                                                                                                        |
| 5a  | render              | na      |                                                                                                                                        |
| 5b  | fetch               | na      |                                                                                                                                        |
| 5c  | browser             | na      |                                                                                                                                        |
| 5d  | check→retry         | na      |                                                                                                                                        |
| 5e  | File class          | na      |                                                                                                                                        |
| 5f  | waitFor             | na      |                                                                                                                                        |
| 5g  | fs operations       | pass    | All fs replaced with next.\* helpers                                                                                                   |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/about.js, pages/posts/\*, next.config.js present                                                                 |
| 6b  | next.config.js      | pass    | Copied to fixture dir                                                                                                                  |
| 6c  | Overrides           | na      |                                                                                                                                        |
| 7a  | No dead code        | pass    |                                                                                                                                        |
| 7b  | retry over timeout  | na      |                                                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                                                        |

## Issues

None

## Warnings

- Original wrapped the production mode block in `process.env.TURBOPACK_DEV ? describe.skip : describe` as a dedup guard. The converted test drops this wrapper. Because the test now lives in `test/production/`, it only runs under start modes, so the dedup is effectively preserved by placement — acceptable, but worth noting.
