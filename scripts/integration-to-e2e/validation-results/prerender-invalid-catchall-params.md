# prerender-invalid-catchall-params: PASS

Straightforward build-failure test cleanly converted to `nextTestSetup` with `skipStart: true`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                         |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                                                                                    |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                                                                                    |
| 1c  | Test titles         | pass    | "should fail the build" preserved                                                                                                                                            |
| 1d  | Describe blocks     | pass    | Outer + "production mode" both preserved                                                                                                                                     |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                                                             |
| 2b  | Response checks     | na      |                                                                                                                                                                              |
| 2c  | FS checks           | na      |                                                                                                                                                                              |
| 2d  | Browser checks      | na      |                                                                                                                                                                              |
| 2e  | Build output        | pass    | `out.stderr` → `out.cliOutput` with same matches                                                                                                                             |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                              |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                              |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                           |
| 3c  | skipStart           | pass    | Build-only test uses `skipStart: true`                                                                                                                                       |
| 3d  | No manual lifecycle | pass    | No `nextBuild` import                                                                                                                                                        |
| 3e  | Cleanup             | pass    |                                                                                                                                                                              |
| 4a  | Directory placement | pass    | `test/production/` correct for prod-only build test                                                                                                                          |
| 4b  | Mode guards         | pass    | `isNextStart` guard present                                                                                                                                                  |
| 4c  | Turbopack guards    | warn    | Original's `TURBOPACK_DEV ? describe.skip` dedup guard dropped; `test/production/` placement makes it naturally not run in a TURBOPACK_DEV CI job, so effectively equivalent |
| 4d  | Dedup guards        | warn    | See 4c                                                                                                                                                                       |
| 4e  | No incorrect env    | pass    | Converted does not use `TURBOPACK_DEV`/`TURBOPACK_BUILD`                                                                                                                     |
| 5a  | render              | na      |                                                                                                                                                                              |
| 5b  | fetch               | na      |                                                                                                                                                                              |
| 5c  | browser             | na      |                                                                                                                                                                              |
| 5d  | check→retry         | na      |                                                                                                                                                                              |
| 5e  | File class          | na      |                                                                                                                                                                              |
| 5f  | waitFor             | na      |                                                                                                                                                                              |
| 5g  | fs operations       | na      |                                                                                                                                                                              |
| 6a  | Fixtures exist      | pass    | `pages/[...slug].js` present                                                                                                                                                 |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                                            |
| 6c  | Overrides           | na      |                                                                                                                                                                              |
| 7a  | No dead code        | pass    |                                                                                                                                                                              |
| 7b  | retry over timeout  | na      |                                                                                                                                                                              |
| 7c  | async/await         | pass    |                                                                                                                                                                              |
| 7d  | eslint              | pass    |                                                                                                                                                                              |

## Issues

None.

## Warnings

- Original `TURBOPACK_DEV ? describe.skip` dedup guard is not explicitly preserved; placement in `test/production/` achieves the same effect since production-mode CI jobs don't set `TURBOPACK_DEV`.
- `if (!isNextStart) { it('skipped', ...); return }` is defensive but unnecessary given `test/production/` only runs in start modes; harmless.
