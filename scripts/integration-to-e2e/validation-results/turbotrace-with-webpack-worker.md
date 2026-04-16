# turbotrace-with-webpack-worker: PASS

Clean 1:1 conversion of a build-only webpack-worker turbotrace test into `test/production/` using `skipStart: true`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 (+1 harmless placeholder guard)                                                                                             |
| 1b  | Assertions          | pass    | original: 11, converted: 11                                                                                                                           |
| 1c  | Test titles         | pass    | 'should build and trace correctly' preserved                                                                                                          |
| 1d  | Describe blocks     | pass    | outer + 'production mode' preserved; inner `TURBOPACK_DEV` describe dropped (redundant under outer `IS_TURBOPACK_TEST` skip)                          |
| 2a  | URL paths           | na      | no HTTP requests                                                                                                                                      |
| 2b  | Response checks     | na      |                                                                                                                                                       |
| 2c  | FS checks           | pass    | `fs.readJSON(join(appDir,...))` → `next.readFile(...)` + JSON.parse                                                                                   |
| 2d  | Browser checks      | na      |                                                                                                                                                       |
| 2e  | Build output        | pass    | `nextBuild` → `next.build()`; `result.code` → `exitCode`; logs `next.cliOutput`                                                                       |
| 2f  | Dynamic logic       | na      |                                                                                                                                                       |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                       |
| 3b  | files param         | pass    | `path.join(__dirname, 'app')`                                                                                                                         |
| 3c  | skipStart           | pass    | build-only → `skipStart: true`, explicit `next.build()`                                                                                               |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                       |
| 3e  | Cleanup             | pass    |                                                                                                                                                       |
| 4a  | Directory placement | pass    | prod-only build trace → `test/production/`                                                                                                            |
| 4b  | Mode guards         | pass    |                                                                                                                                                       |
| 4c  | Turbopack guards    | pass    | outer `IS_TURBOPACK_TEST ? describe.skip : describe` wraps correctly                                                                                  |
| 4d  | Dedup guards        | warn    | inner `TURBOPACK_DEV` dedup guard dropped; harmless because outer already skips all turbopack runs                                                    |
| 4e  | No incorrect env    | pass    |                                                                                                                                                       |
| 5a  | render              | na      |                                                                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                                                       |
| 5c  | browser             | na      |                                                                                                                                                       |
| 5d  | check→retry         | na      |                                                                                                                                                       |
| 5e  | File class          | na      |                                                                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                                                       |
| 5g  | fs operations       | pass    | `next.readFile()` used                                                                                                                                |
| 6a  | Fixtures exist      | pass    | pages/{index,another,image-import}.js, next.config.js, include-me/, node_modules/{some-cms,nested-structure}, public/, content/hello.json all present |
| 6b  | next.config.js      | pass    | copied to fixture                                                                                                                                     |
| 6c  | Overrides           | na      |                                                                                                                                                       |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped...') return }` is dead in `test/production/` (always start mode)                                                     |
| 7b  | retry over timeout  | pass    |                                                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                                                       |

## Issues

None

## Warnings

- Inner `TURBOPACK_DEV` dedup describe was omitted; harmless here because the outer `IS_TURBOPACK_TEST` already skips all turbopack variants.
- The `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` guard is unnecessary since the file lives in `test/production/` which always runs in start mode — could be removed for clarity.
