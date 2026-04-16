# non-next-dist-exclude: PASS

Faithful conversion; all coverage and assertions preserved, fixtures intact, correct use of `nextTestSetup` with `skipStart`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                     |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 (plus 1 no-op skip stub)                                                                                                       |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                                                                                |
| 1c  | Test titles         | pass    | "Externalized non-Next dist-using package" preserved                                                                                                     |
| 1d  | Describe blocks     | pass    | outer + "production mode" both preserved                                                                                                                 |
| 2a  | URL paths           | na      | no HTTP requests                                                                                                                                         |
| 2b  | Response checks     | na      |                                                                                                                                                          |
| 2c  | FS checks           | pass    | `readNextBuildServerPageFile` → `next.readFile('.next/server/pages/index.js')`                                                                           |
| 2d  | Browser checks      | na      |                                                                                                                                                          |
| 2e  | Build output        | pass    | `nextBuild(appDir)` → `await next.build()`                                                                                                               |
| 2f  | Dynamic logic       | na      |                                                                                                                                                          |
| 3a  | nextTestSetup       | pass    | used                                                                                                                                                     |
| 3b  | files param         | pass    | `path.join(__dirname, 'app')` pointing at real fixture                                                                                                   |
| 3c  | skipStart           | pass    | build-only test, `skipStart: true` + explicit `next.build()`                                                                                             |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                          |
| 3e  | Cleanup             | pass    | nothing needed                                                                                                                                           |
| 4a  | Directory placement | pass    | prod-only → `test/production/`                                                                                                                           |
| 4b  | Mode guards         | pass    | `isNextStart` guard present (though redundant in test/production/)                                                                                       |
| 4c  | Turbopack guards    | na      | original used dedup, not turbopack-skip                                                                                                                  |
| 4d  | Dedup guards        | warn    | original had `TURBOPACK_DEV ? describe.skip` dedup; dropped. In test/production/ the test runs only under start modes so it's benign, but not a 1:1 port |
| 4e  | No incorrect env    | pass    | no env-based skip in converted                                                                                                                           |
| 5a  | render              | na      |                                                                                                                                                          |
| 5b  | fetch               | na      |                                                                                                                                                          |
| 5c  | browser             | na      |                                                                                                                                                          |
| 5d  | check→retry         | na      |                                                                                                                                                          |
| 5e  | File class          | na      |                                                                                                                                                          |
| 5f  | waitFor             | na      |                                                                                                                                                          |
| 5g  | fs operations       | pass    | uses `next.readFile`                                                                                                                                     |
| 6a  | Fixtures exist      | pass    | pages/index.js, package.json, notnext module all present                                                                                                 |
| 6b  | next.config.js      | na      | neither had one                                                                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                                                          |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped'...); return }` is effectively dead in `test/production/`                                                               |
| 7b  | retry over timeout  | na      |                                                                                                                                                          |
| 7c  | async/await         | pass    |                                                                                                                                                          |
| 7d  | eslint              | pass    |                                                                                                                                                          |

## Issues

None.

## Warnings

- Original `TURBOPACK_DEV ? describe.skip` dedup guard wasn't ported verbatim; substituted with `isNextStart` early-return, which is always-true in `test/production/` and thus dead code. Harmless but the skip stub `it('skipped for non-start mode', ...)` will never trigger here and could be removed for clarity.
