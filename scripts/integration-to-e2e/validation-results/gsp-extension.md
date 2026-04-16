# gsp-extension: PASS

Clean conversion of all 3 production-mode tests with fixtures intact and proper API migration.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                          |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3 (+1 skip placeholder)                                                                               |
| 1b  | Assertions          | pass    | original: 4 expects, converted: 4 expects                                                                                     |
| 1c  | Test titles         | pass    | All 3 titles preserved verbatim                                                                                               |
| 1d  | Describe blocks     | pass    | Outer + "production mode" preserved                                                                                           |
| 2a  | URL paths           | pass    | `/{name}` and `/_next/data/{buildId}/{name}.json` covered                                                                     |
| 2b  | Response checks     | pass    | Content and pageProps.value checks preserved                                                                                  |
| 2c  | FS checks           | pass    | Uses `next.hasFile()` / `next.readFile()`                                                                                     |
| 2d  | Browser checks      | na      |                                                                                                                               |
| 2e  | Build output        | na      | Not tested directly                                                                                                           |
| 2f  | Dynamic logic       | na      |                                                                                                                               |
| 3a  | nextTestSetup       | pass    |                                                                                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                            |
| 3c  | skipStart           | na      | Server used for render/fetch; default start correct                                                                           |
| 3d  | No manual lifecycle | pass    |                                                                                                                               |
| 3e  | Cleanup             | pass    |                                                                                                                               |
| 4a  | Directory placement | pass    | Production-only → test/production/                                                                                            |
| 4b  | Mode guards         | pass    | `if (!isNextStart) return` preserves prod-only behavior                                                                       |
| 4c  | Turbopack guards    | pass    | Original TURBOPACK_DEV guard was dedup, not TB-specific                                                                       |
| 4d  | Dedup guards        | warn    | Original skipped on TURBOPACK_DEV; converted uses `isNextStart` — effectively dedups since production tests only run in start |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD usage                                                                                                  |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render()`                                                                                             |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch()`                                                                                               |
| 5c  | browser             | na      |                                                                                                                               |
| 5d  | check→retry         | na      |                                                                                                                               |
| 5e  | File class          | na      |                                                                                                                               |
| 5f  | waitFor             | na      |                                                                                                                               |
| 5g  | fs operations       | pass    | Uses `next.hasFile()` / `next.readFile()`                                                                                     |
| 6a  | Fixtures exist      | pass    | `pages/[slug].js` present                                                                                                     |
| 6b  | next.config.js      | na      | Original had none                                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                               |
| 7a  | No dead code        | pass    |                                                                                                                               |
| 7b  | retry over timeout  | na      | No polling needed                                                                                                             |
| 7c  | async/await         | pass    |                                                                                                                               |
| 7d  | eslint              | pass    |                                                                                                                               |

## Issues

None.

## Warnings

- The `if (!isNextStart) { it('skipped', ...); return }` pattern inside a describe that calls `nextTestSetup()` still spins up the test harness. Since this lives in `test/production/`, it only runs in start mode anyway — the guard is a harmless safety net but technically unnecessary.
