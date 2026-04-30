# cli: PASS

Conversion preserves all 66 tests, all titles, and all describe structure; lifecycle/fixtures are correctly set up for a CLI-focused e2e suite.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                     |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 66, converted: 66                                                                                                                                              |
| 1b  | Assertions          | pass    | original: 73, converted: 106 (more `expect` inside `retry`)                                                                                                              |
| 1c  | Test titles         | pass    | All preserved (only whitespace differs)                                                                                                                                  |
| 1d  | Describe blocks     | pass    | CLI Usage > production mode > start/telemetry/build; no command; dev; export; info — all preserved                                                                       |
| 2a  | URL paths           | na      | CLI test, no HTTP routing exercised                                                                                                                                      |
| 2b  | Response checks     | pass    | stdout/stderr assertions preserved                                                                                                                                       |
| 2c  | FS checks           | pass    | `fs.writeFile`/`fs.remove` → `next.patchFile`/`next.deleteFile`                                                                                                          |
| 2d  | Browser checks      | na      |                                                                                                                                                                          |
| 2e  | Build output        | pass    | `nextBuild` calls preserved (CLI test allowlist)                                                                                                                         |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                          |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup({ files, skipStart: true })`                                                                                                                         |
| 3b  | files param         | pass    | `files: join(__dirname, 'basic')` — real fixture dir                                                                                                                     |
| 3c  | skipStart           | pass    | `skipStart: true` (CLI tests launch apps manually)                                                                                                                       |
| 3d  | No manual lifecycle | pass    | `findPort/launchApp/nextBuild/runNextCommand*` — CLI test allowlist exception                                                                                            |
| 3e  | Cleanup             | pass    | `killApp` calls in `finally` blocks preserved                                                                                                                            |
| 4a  | Directory placement | pass    | test/e2e/ — matches original (runs across modes)                                                                                                                         |
| 4b  | Mode guards         | pass    | `isNextStart ? describe : describe.skip` guards 'production mode' block                                                                                                  |
| 4c  | Turbopack guards    | warn    | Original used `TURBOPACK_DEV` skip; converted tightened to `isNextStart`. Slight coverage reduction in webpack-dev mode, but tests are start-mode specific so acceptable |
| 4d  | Dedup guards        | na      |                                                                                                                                                                          |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` skip logic                                                                                                                          |
| 5a  | render              | na      |                                                                                                                                                                          |
| 5b  | fetch               | na      |                                                                                                                                                                          |
| 5c  | browser             | na      |                                                                                                                                                                          |
| 5d  | check→retry         | pass    | All `check()` converted to `retry()+expect()`                                                                                                                            |
| 5e  | File class          | na      |                                                                                                                                                                          |
| 5f  | waitFor             | na      | Not used                                                                                                                                                                 |
| 5g  | fs operations       | pass    | `fs.writeFile/remove(join(dirBasic,…))` → `next.patchFile/deleteFile`                                                                                                    |
| 6a  | Fixtures exist      | pass    | `basic/pages/index.js`, `basic/file with spaces…`, `duplicate-sass/{pages,package.json,node_modules}`, `certificates/{localhost-key.pem,localhost.pem}`                  |
| 6b  | next.config.js      | na      | Original had none; not needed                                                                                                                                            |
| 6c  | Overrides           | na      |                                                                                                                                                                          |
| 7a  | No dead code        | pass    | `check` import dropped after conversion                                                                                                                                  |
| 7b  | retry over timeout  | pass    | No `setTimeout`                                                                                                                                                          |
| 7c  | async/await         | pass    |                                                                                                                                                                          |
| 7d  | eslint              | pass    | Renamed loop var `check`→`typo` to avoid shadowing                                                                                                                       |

## Issues

None.

## Warnings

- 4c: The 'production mode' gating changed from `!TURBOPACK_DEV` to `isNextStart`. Tests inside are inherently start-mode-oriented (nextBuild + CLI start commands), so this is more semantically correct, but is a minor coverage shift from the original behavior in webpack-dev mode.
- The `duplicate-sass` fixture is loaded from `join(__dirname, 'duplicate-sass')` directly (not via `next.testDir`). This is acceptable since the test directly runs `launchApp` on that path, but note that the fixture's `node_modules/` is used in place.
