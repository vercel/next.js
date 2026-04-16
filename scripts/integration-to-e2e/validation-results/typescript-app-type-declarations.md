# typescript-app-type-declarations: WARN

Conversion preserves the 3 tests and assertions but drops the `strictRouteTypes` beforeAll/afterAll path from the original.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                          |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                                                                                                     |
| 1b  | Assertions          | pass    | original: 3 expects, converted: 3 expects                                                                                                                     |
| 1c  | Test titles         | pass    | All three preserved verbatim                                                                                                                                  |
| 1d  | Describe blocks     | pass    | Single describe preserved                                                                                                                                     |
| 2a  | URL paths           | pass    | `/` accessed via `next.render('/')`                                                                                                                           |
| 2b  | Response checks     | pass    | File content equality preserved                                                                                                                               |
| 2c  | FS checks           | pass    | Uses `next.readFile`/`patchFile`/`deleteFile`; direct `fs.statSync` on `next.testDir` acceptable (no stat helper)                                             |
| 2d  | Browser checks      | na      |                                                                                                                                                               |
| 2e  | Build output        | na      |                                                                                                                                                               |
| 2f  | Dynamic logic       | warn    | Original swapped in `next-env.strictRouteTypes.d.ts` when `__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES=true`; converted drops this path and the fixture is missing |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                            |
| 3c  | skipStart           | na      | Dev server is needed to generate next-env.d.ts                                                                                                                |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                               |
| 3e  | Cleanup             | pass    | nextTestSetup isolates per run                                                                                                                                |
| 4a  | Directory placement | pass    | Dev-only (original used launchApp) → `test/development/` correct                                                                                              |
| 4b  | Mode guards         | na      |                                                                                                                                                               |
| 4c  | Turbopack guards    | na      |                                                                                                                                                               |
| 4d  | Dedup guards        | na      |                                                                                                                                                               |
| 4e  | No incorrect env    | pass    |                                                                                                                                                               |
| 5a  | render              | pass    |                                                                                                                                                               |
| 5b  | fetch               | na      |                                                                                                                                                               |
| 5c  | browser             | na      |                                                                                                                                                               |
| 5d  | check→retry         | pass    | Uses `retry` where polling needed                                                                                                                             |
| 5e  | File class          | na      |                                                                                                                                                               |
| 5f  | waitFor             | warn    | `waitFor(1000)` used for mtime separation; acceptable as a timing delay but could be tighter                                                                  |
| 5g  | fs operations       | pass    | Direct `fs.statSync` uses `next.testDir` path (correct)                                                                                                       |
| 6a  | Fixtures exist      | pass    | `pages/index.tsx`, `tsconfig.json` present                                                                                                                    |
| 6b  | next.config.js      | na      | Original has none                                                                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                                                               |
| 7a  | No dead code        | pass    |                                                                                                                                                               |
| 7b  | retry over timeout  | pass    |                                                                                                                                                               |
| 7c  | async/await         | pass    |                                                                                                                                                               |
| 7d  | eslint              | pass    |                                                                                                                                                               |

## Issues

None

## Warnings

- The original `strictRouteTypes` branch (renaming `next-env.d.ts` ↔ `next-env.strictRouteTypes.d.ts` based on `__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES`) is not reproduced; the `next-env.strictRouteTypes.d.ts` fixture is absent in the converted directory.
- Test 3 relies on a 1s `waitFor` to let the clock tick past the initial stat; using `retry` to assert mtime stability would be more robust.
