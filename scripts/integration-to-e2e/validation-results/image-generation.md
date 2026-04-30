# image-generation: PASS

Clean 1:1 conversion of a single production-mode test with fixture file preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                          |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                     |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                                     |
| 1c  | Test titles         | pass    | "should generate the image without errors" preserved                                                          |
| 1d  | Describe blocks     | pass    | `Image Generation > production mode` → `image-generation > production mode`                                   |
| 2a  | URL paths           | pass    | `/api/image` covered                                                                                          |
| 2b  | Response checks     | pass    | status, Content-Type, PNG magic bytes all preserved                                                           |
| 2c  | FS checks           | na      |                                                                                                               |
| 2d  | Browser checks      | na      |                                                                                                               |
| 2e  | Build output        | na      |                                                                                                               |
| 2f  | Dynamic logic       | na      |                                                                                                               |
| 3a  | nextTestSetup       | pass    |                                                                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                                                                            |
| 3c  | skipStart           | na      | runs server, prod-only directory                                                                              |
| 3d  | No manual lifecycle | pass    | no findPort/killApp/etc.                                                                                      |
| 3e  | Cleanup             | pass    | handled by nextTestSetup                                                                                      |
| 4a  | Directory placement | pass    | test/production/ matches prod-only original                                                                   |
| 4b  | Mode guards         | pass    |                                                                                                               |
| 4c  | Turbopack guards    | na      | original skip was for TURBOPACK_DEV (dedup), not a bundler skip                                               |
| 4d  | Dedup guards        | warn    | original had `TURBOPACK_DEV ? describe.skip` — not preserved, but placement in test/production/ makes it moot |
| 4e  | No incorrect env    | pass    |                                                                                                               |
| 5a  | render              | na      |                                                                                                               |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                                     |
| 5c  | browser             | na      |                                                                                                               |
| 5d  | check→retry         | na      |                                                                                                               |
| 5e  | File class          | na      |                                                                                                               |
| 5f  | waitFor             | na      |                                                                                                               |
| 5g  | fs operations       | na      |                                                                                                               |
| 6a  | Fixtures exist      | pass    | pages/api/image.jsx present                                                                                   |
| 6b  | next.config.js      | na      | original had none                                                                                             |
| 6c  | Overrides           | pass    | `@vercel/og` dependency declared                                                                              |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped...'); return }` is unreachable in test/production/                           |
| 7b  | retry over timeout  | na      |                                                                                                               |
| 7c  | async/await         | pass    |                                                                                                               |
| 7d  | eslint              | pass    |                                                                                                               |

## Issues

None

## Warnings

- 4d: Original `TURBOPACK_DEV ? describe.skip` dedup guard not explicitly preserved; effectively inert since `test/production/` isn't exercised by dev-mode jobs.
- 7a: The `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` branch is unreachable inside `test/production/` and could be removed.
