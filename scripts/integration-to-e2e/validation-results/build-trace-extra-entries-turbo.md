# build-trace-extra-entries-turbo: PASS

Converted build-only test preserves all assertions, uses `skipStart: true` with `next.build()`, and maps the Turbopack skip to `isTurbopack` correctly.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                              |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 (+1 dead skip placeholder)                                                                                                              |
| 1b  | Assertions          | pass    | original: 14, converted: 14                                                                                                                                       |
| 1c  | Test titles         | pass    | "should build and trace correctly" preserved                                                                                                                      |
| 1d  | Describe blocks     | pass    | outer + "production mode" preserved                                                                                                                               |
| 2a  | URL paths           | na      | no HTTP access                                                                                                                                                    |
| 2b  | Response checks     | na      |                                                                                                                                                                   |
| 2c  | FS checks           | pass    | uses `next.readFile()` instead of `fs.readJSON(appDir, ...)`                                                                                                      |
| 2d  | Browser checks      | na      |                                                                                                                                                                   |
| 2e  | Build output        | pass    | `next.build()` exitCode checked                                                                                                                                   |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                   |
| 3a  | nextTestSetup       | pass    | from 'e2e-utils'                                                                                                                                                  |
| 3b  | files param         | pass    | `path.join(__dirname, 'app')` matches original `../app`                                                                                                           |
| 3c  | skipStart           | pass    | build-only test, uses skipStart: true                                                                                                                             |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                   |
| 3e  | Cleanup             | pass    |                                                                                                                                                                   |
| 4a  | Directory placement | pass    | test/production/ correct for prod-only                                                                                                                            |
| 4b  | Mode guards         | pass    |                                                                                                                                                                   |
| 4c  | Turbopack guards    | pass    | `isTurbopack` used to gate hello.json check; the outer `TURBOPACK_DEV` skip is effectively covered by test/production placement                                   |
| 4d  | Dedup guards        | na      |                                                                                                                                                                   |
| 4e  | No incorrect env    | pass    | uses `isTurbopack` from setup, not env                                                                                                                            |
| 5a  | render              | na      |                                                                                                                                                                   |
| 5b  | fetch               | na      |                                                                                                                                                                   |
| 5c  | browser             | na      |                                                                                                                                                                   |
| 5d  | check→retry         | na      |                                                                                                                                                                   |
| 5e  | File class          | na      |                                                                                                                                                                   |
| 5f  | waitFor             | na      |                                                                                                                                                                   |
| 5g  | fs operations       | pass    | migrated to `next.readFile()`                                                                                                                                     |
| 6a  | Fixtures exist      | pass    | pages/{index,another,image-import}.js, app/route1/route.js, next.config.js, node_modules fixtures, content/hello.json, public/_, include-me/_, lib/\* all present |
| 6b  | next.config.js      | pass    | present in fixture                                                                                                                                                |
| 6c  | Overrides           | na      |                                                                                                                                                                   |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped', () => {}); return }` is unreachable in test/production/ and contradicts guidance in 4c (nextTestSetup already ran)             |
| 7b  | retry over timeout  | na      |                                                                                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                                                                   |
| 7d  | eslint              | pass    |                                                                                                                                                                   |

## Issues

None.

## Warnings

- Dead `if (!isNextStart)` placeholder skip block inside the describe — unreachable in `test/production/` and adds a stray test entry. Consider removing to match the pattern recommended by criterion 4c.
