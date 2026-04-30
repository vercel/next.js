# turborepo-access-trace: PASS

Single-test production build conversion preserves all assertions; `skipStart: true` with explicit `next.build()` is correctly used and fixture files are present.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                        |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 real + 1 no-op skip safeguard                                     |
| 1b  | Assertions          | pass    | original: 6, converted: 6                                                                   |
| 1c  | Test titles         | pass    | "should build and output trace correctly" preserved                                         |
| 1d  | Describe blocks     | pass    | Both outer "build with proxy trace" and "production mode" preserved                         |
| 2a  | URL paths           | na      | No HTTP calls                                                                               |
| 2b  | Response checks     | na      |                                                                                             |
| 2c  | FS checks           | pass    | `fs.readJSON(appDir/...)` → `JSON.parse(await next.readFile(...))`                          |
| 2d  | Browser checks      | na      |                                                                                             |
| 2e  | Build output        | pass    | `nextBuild` → `next.build({ env })`; `result.code` → `exitCode`                             |
| 2f  | Dynamic logic       | na      |                                                                                             |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from 'e2e-utils'                                                       |
| 3b  | files param         | pass    | `files: path.join(__dirname, 'app')`                                                        |
| 3c  | skipStart           | pass    | Build-only test, uses `skipStart: true`                                                     |
| 3d  | No manual lifecycle | pass    | No nextBuild/startApp imports                                                               |
| 3e  | Cleanup             | pass    | nextTestSetup handles cleanup                                                               |
| 4a  | Directory placement | pass    | `test/production/` correct — original was prod-only                                         |
| 4b  | Mode guards         | pass    | `isNextStart` check present (redundant in production dir but harmless)                      |
| 4c  | Turbopack guards    | na      | Original's `TURBOPACK_DEV` skip was dev-mode dedup; moving to `test/production/` handles it |
| 4d  | Dedup guards        | pass    | Directory placement in `test/production/` avoids redundant dev runs                         |
| 4e  | No incorrect env    | pass    | No `process.env.TURBOPACK_DEV/BUILD` checks                                                 |
| 5a  | render              | na      |                                                                                             |
| 5b  | fetch               | na      |                                                                                             |
| 5c  | browser             | na      |                                                                                             |
| 5d  | check→retry         | na      |                                                                                             |
| 5e  | File class          | na      |                                                                                             |
| 5f  | waitFor             | na      |                                                                                             |
| 5g  | fs operations       | pass    | Switched to `next.readFile`                                                                 |
| 6a  | Fixtures exist      | pass    | app/, lib/, next.config.js, node_modules/, pages/, public/ all present                      |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                      |
| 6c  | Overrides           | na      |                                                                                             |
| 7a  | No dead code        | pass    |                                                                                             |
| 7b  | retry over timeout  | na      | No polling needed                                                                           |
| 7c  | async/await         | pass    |                                                                                             |
| 7d  | eslint              | pass    |                                                                                             |

## Issues

None

## Warnings

None
