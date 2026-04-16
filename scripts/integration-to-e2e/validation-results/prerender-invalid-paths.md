# prerender-invalid-paths: PASS

Faithful 1:1 conversion of a single build-failure test to `test/production/` with `skipStart: true` and equivalent assertions against `cliOutput`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                       |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 1, converted: 1 (+1 skip placeholder)                                                                                                                                            |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                                                                                                                  |
| 1c  | Test titles         | pass    | "should fail the build" preserved                                                                                                                                                          |
| 1d  | Describe blocks     | pass    | Legacy Prerender → production mode → handles old getStaticParams preserved                                                                                                                 |
| 2a  | URL paths           | na      | Build-only test                                                                                                                                                                            |
| 2b  | Response checks     | na      |                                                                                                                                                                                            |
| 2c  | FS checks           | na      |                                                                                                                                                                                            |
| 2d  | Browser checks      | na      |                                                                                                                                                                                            |
| 2e  | Build output        | pass    | `next.build().cliOutput` matches original `out.stderr` assertions                                                                                                                          |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                                            |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                                                                                                                                          |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                         |
| 3c  | skipStart           | pass    | Build-only → `skipStart: true`                                                                                                                                                             |
| 3d  | No manual lifecycle | pass    | No nextBuild/launchApp imports                                                                                                                                                             |
| 3e  | Cleanup             | pass    | No cleanup needed                                                                                                                                                                          |
| 4a  | Directory placement | pass    | test/production/ matches prod-only nextBuild test                                                                                                                                          |
| 4b  | Mode guards         | warn    | `if (!isNextStart) { it('skipped', () => {}); return }` runs inside describe after nextTestSetup — unnecessary in test/production/; safe but redundant                                     |
| 4c  | Turbopack guards    | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip : describe`; since this is now under test/production/ (runs only in start mode), the TURBOPACK_DEV guard becomes moot — acceptable |
| 4d  | Dedup guards        | na      |                                                                                                                                                                                            |
| 4e  | No incorrect env    | pass    | No direct TURBOPACK_DEV/TURBOPACK_BUILD references                                                                                                                                         |
| 5a  | render              | na      |                                                                                                                                                                                            |
| 5b  | fetch               | na      |                                                                                                                                                                                            |
| 5c  | browser             | na      |                                                                                                                                                                                            |
| 5d  | check→retry         | na      |                                                                                                                                                                                            |
| 5e  | File class          | na      |                                                                                                                                                                                            |
| 5f  | waitFor             | na      |                                                                                                                                                                                            |
| 5g  | fs operations       | na      |                                                                                                                                                                                            |
| 6a  | Fixtures exist      | pass    | pages/[foo]/[post].js present, matches original                                                                                                                                            |
| 6b  | next.config.js      | na      | Neither original nor converted has one                                                                                                                                                     |
| 6c  | Overrides           | na      |                                                                                                                                                                                            |
| 7a  | No dead code        | pass    |                                                                                                                                                                                            |
| 7b  | retry over timeout  | na      |                                                                                                                                                                                            |
| 7c  | async/await         | pass    |                                                                                                                                                                                            |
| 7d  | eslint              | pass    |                                                                                                                                                                                            |

## Issues

None

## Warnings

- The `if (!isNextStart) { it('skipped', ...); return }` guard inside the describe block invokes `nextTestSetup` first; since this file lives in `test/production/`, the guard is effectively dead code and could be removed for clarity.
- The original's `process.env.TURBOPACK_DEV` skip was not explicitly replicated, but placement in `test/production/` makes it unnecessary.
