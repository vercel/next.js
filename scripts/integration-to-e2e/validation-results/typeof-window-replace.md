# typeof-window-replace: PASS

Conversion faithfully preserves all three build-output assertions from the original `test/integration/typeof-window-replace` suite.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                   |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 3, converted: 3 (plus 1 inert placeholder that never runs in test/production)                                                                |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                                                                              |
| 1c  | Test titles         | pass    | All three titles preserved verbatim                                                                                                                    |
| 1d  | Describe blocks     | pass    | Outer + "production mode" nesting preserved                                                                                                            |
| 2a  | URL paths           | na      | Build-only test, no HTTP                                                                                                                               |
| 2b  | Response checks     | na      | No response assertions                                                                                                                                 |
| 2c  | FS checks           | pass    | Uses `next.readFile()` for manifest + page bundles; uses `fs.readdirSync(next.testDir, ...)` for server chunks/pages (no `next.readdir` helper exists) |
| 2d  | Browser checks      | na      |                                                                                                                                                        |
| 2e  | Build output        | pass    | `await next.build()` replaces `nextBuild(appDir)`                                                                                                      |
| 2f  | Dynamic logic       | na      |                                                                                                                                                        |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                        |
| 3b  | files param         | pass    | `files: path.join(__dirname, 'app')` matches original `../app` layout                                                                                  |
| 3c  | skipStart           | pass    | `skipStart: true` + explicit `next.build()` in `beforeAll`                                                                                             |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/nextBuild imports                                                                                                                  |
| 3e  | Cleanup             | pass    | No cleanup needed                                                                                                                                      |
| 4a  | Directory placement | pass    | Build-only → `test/production/` correct                                                                                                                |
| 4b  | Mode guards         | pass    | `isNextStart` matches production-only scope                                                                                                            |
| 4c  | Turbopack guards    | pass    | Placement in test/production handles the original `TURBOPACK_DEV` skip                                                                                 |
| 4d  | Dedup guards        | pass    | `TURBOPACK_DEV ? describe.skip : describe` guard effectively replaced by directory placement (test/production doesn't run dev modes)                   |
| 4e  | No incorrect env    | pass    | No raw `TURBOPACK_DEV`/`TURBOPACK_BUILD` env checks in converted                                                                                       |
| 5a  | render              | na      |                                                                                                                                                        |
| 5b  | fetch               | na      |                                                                                                                                                        |
| 5c  | browser             | na      |                                                                                                                                                        |
| 5d  | check→retry         | na      |                                                                                                                                                        |
| 5e  | File class          | na      |                                                                                                                                                        |
| 5f  | waitFor             | na      |                                                                                                                                                        |
| 5g  | fs operations       | pass    | Manifest reads converted to `next.readFile()`; remaining `fs` calls scoped to `next.testDir` (isolated path), not stale `appDir`                       |
| 6a  | Fixtures exist      | pass    | `app/pages/index.js`, `app/package.json`, `app/node_modules/comps/{index.js,package.json}` all present                                                 |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                                                                         |
| 6c  | Overrides           | na      |                                                                                                                                                        |
| 7a  | No dead code        | warn    | `if (!isNextStart) { it('skipped', () => {}); return }` is unreachable in test/production but harmless                                                 |
| 7b  | retry over timeout  | na      |                                                                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                                                                        |

## Issues

None.

## Warnings

- The `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` guard inside the describe is dead code since test/production always runs in start mode. Could be removed for clarity, but does not affect correctness.
