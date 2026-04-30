# re-export-all-exports-from-page-disallowed: PASS

Clean conversion: both build-failure and patch-and-retry tests preserved using `skipStart`, `next.build()`, `next.readFile()`, and `next.patchFile()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                    |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                                                                               |
| 1b  | Assertions          | pass    | original: 8, converted: 8                                                                                                                                               |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                                                                          |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner `production mode` flattened (appropriate since file lives in test/production/)                                                          |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                                                        |
| 2b  | Response checks     | na      | No HTTP responses                                                                                                                                                       |
| 2c  | FS checks           | pass    | `fs` replaced with `next.readFile`/`next.patchFile`                                                                                                                     |
| 2d  | Browser checks      | na      |                                                                                                                                                                         |
| 2e  | Build output        | pass    | Uses `next.build()` returning `{cliOutput, exitCode}`                                                                                                                   |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                         |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                         |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                      |
| 3c  | skipStart           | pass    | Build-only, `skipStart: true`                                                                                                                                           |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                         |
| 3e  | Cleanup             | pass    | Restores file via `patchFile` in finally                                                                                                                                |
| 4a  | Directory placement | pass    | test/production/ matches build-only test                                                                                                                                |
| 4b  | Mode guards         | na      |                                                                                                                                                                         |
| 4c  | Turbopack guards    | na      | Original's `TURBOPACK_DEV` guard was dedup; see 4d                                                                                                                      |
| 4d  | Dedup guards        | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip : describe` — not preserved, but placing in test/production/ and using `next.build()` makes redundancy unlikely |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                         |
| 5a  | render              | na      |                                                                                                                                                                         |
| 5b  | fetch               | na      |                                                                                                                                                                         |
| 5c  | browser             | na      |                                                                                                                                                                         |
| 5d  | check→retry         | na      |                                                                                                                                                                         |
| 5e  | File class          | pass    | `new File()` → `next.readFile`+`patchFile`                                                                                                                              |
| 5f  | waitFor             | na      |                                                                                                                                                                         |
| 5g  | fs operations       | pass    |                                                                                                                                                                         |
| 6a  | Fixtures exist      | pass    | pages/{index,about,contact}.js, component/, world.txt all present                                                                                                       |
| 6b  | next.config.js      | na      | Neither original nor converted have one                                                                                                                                 |
| 6c  | Overrides           | na      |                                                                                                                                                                         |
| 7a  | No dead code        | pass    |                                                                                                                                                                         |
| 7b  | retry over timeout  | na      |                                                                                                                                                                         |
| 7c  | async/await         | pass    |                                                                                                                                                                         |
| 7d  | eslint              | pass    |                                                                                                                                                                         |

## Issues

None

## Warnings

- 4d: The original's `TURBOPACK_DEV` describe.skip guard was not carried over. Since the converted test lives in `test/production/` and uses `next.build()` (always prod), the practical impact is minimal, but the dedup guard pattern was dropped.
