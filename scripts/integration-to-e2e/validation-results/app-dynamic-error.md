# app-dynamic-error: PASS

Clean 1:1 conversion of a single build-only test, moved to `test/production/` with `skipStart: true` and fixtures copied.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                          |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 it, converted: 1 real it + 1 no-op skip placeholder                                                                               |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                                                     |
| 1c  | Test titles         | pass    | "throws an error when prerendering a page with config dynamic error" preserved                                                                |
| 1d  | Describe blocks     | pass    | outer + "production mode" describe preserved                                                                                                  |
| 2a  | URL paths           | na      | no HTTP requests                                                                                                                              |
| 2b  | Response checks     | na      |                                                                                                                                               |
| 2c  | FS checks           | na      |                                                                                                                                               |
| 2d  | Browser checks      | na      |                                                                                                                                               |
| 2e  | Build output        | pass    | `nextBuild stderr/code` → `next.build() exitCode` + `next.cliOutput`                                                                          |
| 2f  | Dynamic logic       | na      |                                                                                                                                               |
| 3a  | nextTestSetup       | pass    | imported from e2e-utils                                                                                                                       |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                            |
| 3c  | skipStart           | pass    | build-only test, `skipStart: true` + explicit `next.build()`                                                                                  |
| 3d  | No manual lifecycle | pass    | no nextBuild/launchApp imports                                                                                                                |
| 3e  | Cleanup             | pass    | no cleanup needed                                                                                                                             |
| 4a  | Directory placement | pass    | `test/production/` correct — original was prod-only                                                                                           |
| 4b  | Mode guards         | pass    | `isNextStart` guard matches original's production-only scope                                                                                  |
| 4c  | Turbopack guards    | na      |                                                                                                                                               |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_DEV ? describe.skip` guard; not preserved but `test/production/` already excludes dev runs, so effectively equivalent |
| 4e  | No incorrect env    | pass    | no TURBOPACK_DEV/BUILD usage                                                                                                                  |
| 5a  | render              | na      |                                                                                                                                               |
| 5b  | fetch               | na      |                                                                                                                                               |
| 5c  | browser             | na      |                                                                                                                                               |
| 5d  | check→retry         | na      |                                                                                                                                               |
| 5e  | File class          | na      |                                                                                                                                               |
| 5f  | waitFor             | na      |                                                                                                                                               |
| 5g  | fs operations       | na      |                                                                                                                                               |
| 6a  | Fixtures exist      | pass    | `app/layout.js`, `app/dynamic-error/page.js`, `app/dynamic-error/loading.js`, `next.config.js` all present                                    |
| 6b  | next.config.js      | pass    | copied to converted dir                                                                                                                       |
| 6c  | Overrides           | na      |                                                                                                                                               |
| 7a  | No dead code        | pass    |                                                                                                                                               |
| 7b  | retry over timeout  | na      |                                                                                                                                               |
| 7c  | async/await         | pass    |                                                                                                                                               |
| 7d  | eslint              | pass    |                                                                                                                                               |

## Issues

None

## Warnings

- 4d: Original used `process.env.TURBOPACK_DEV ? describe.skip : describe`. The converted test omits this explicit guard, relying on `test/production/` placement + `isNextStart` check. Functionally equivalent since production-suite runners don't set TURBOPACK_DEV in a dev context, but the dedup intent is implicit rather than explicit.
