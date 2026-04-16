# dist-dir: PASS

The conversion cleanly consolidates the original dev/prod duplicate describes into a single e2e describe using `isNextDev`/`isNextStart` guards, preserving all behaviors.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                              |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 8 (dev+prod duplicated 3 tests + 2 prod-only); converted: 5 it() calls, which run in both modes in e2e/, covering all 8 execution paths |
| 1b  | Assertions          | pass    | original: 8; converted: 6 (consolidated via if/else) — coverage preserved                                                                         |
| 1c  | Test titles         | pass    | All preserved; dev/prod duplicates merged                                                                                                         |
| 1d  | Describe blocks     | pass    | Nested describes flattened appropriately; dev/prod handled via isNextDev/isNextStart                                                              |
| 2a  | URL paths           | pass    | `/` rendered via next.render                                                                                                                      |
| 2b  | Response checks     | pass    | HTML match preserved                                                                                                                              |
| 2c  | FS checks           | pass    | `fs.existsSync` → `next.hasFile`                                                                                                                  |
| 2d  | Browser checks      | na      |                                                                                                                                                   |
| 2e  | Build output        | pass    | `nextBuild` stderr → `next.build()` cliOutput                                                                                                     |
| 2f  | Dynamic logic       | pass    | dev/prod branches mapped to isNextDev/isNextStart                                                                                                 |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                   |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                |
| 3c  | skipStart           | na      | Server must start for render test                                                                                                                 |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                   |
| 3e  | Cleanup             | pass    | patchFile restores config                                                                                                                         |
| 4a  | Directory placement | pass    | test/e2e/ correct — runs in both modes                                                                                                            |
| 4b  | Mode guards         | pass    | isNextDev/isNextStart used correctly                                                                                                              |
| 4c  | Turbopack guards    | na      | Original TURBOPACK_DEV/BUILD guards were mode-dedup, now handled by e2e mode split                                                                |
| 4d  | Dedup guards        | na      |                                                                                                                                                   |
| 4e  | No incorrect env    | pass    |                                                                                                                                                   |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                                                   |
| 5c  | browser             | na      |                                                                                                                                                   |
| 5d  | check→retry         | na      |                                                                                                                                                   |
| 5e  | File class          | pass    | Uses next.patchFile for config mutation                                                                                                           |
| 5f  | waitFor             | na      |                                                                                                                                                   |
| 5g  | fs operations       | pass    | fs.existsSync/readFile → next.hasFile/readFile                                                                                                    |
| 6a  | Fixtures exist      | pass    | pages/index.js, next.config.js present                                                                                                            |
| 6b  | next.config.js      | pass    | distDir: 'dist' preserved                                                                                                                         |
| 6c  | Overrides           | na      |                                                                                                                                                   |
| 7a  | No dead code        | pass    |                                                                                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                                                   |
| 7d  | eslint              | pass    |                                                                                                                                                   |

## Issues

None

## Warnings

- 1b: Original's `expect(stderr).toBeEmpty()` was converted to `expect(cliOutput).not.toContain('Invalid distDir')`, which is slightly less strict (cliOutput includes build logs so it won't be empty). The weaker assertion is justified given the API change; still covers the intended behavior.
