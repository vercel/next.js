# revalidate-as-path: PASS

Conversion faithfully preserves all 4 tests with equivalent behavior and properly migrates from manual lifecycle to `nextTestSetup`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                   |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 4, converted: 4                                                                                                                              |
| 1b  | Assertions          | pass    | original: 5, converted: 7                                                                                                                              |
| 1c  | Test titles         | pass    | All 4 preserved verbatim                                                                                                                               |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner `production mode` flattened appropriately                                                                              |
| 2a  | URL paths           | pass    | `/`, `/another/index`, `/_next/data/$buildId/index.json`, `/_next/data/$buildId/another/index.json` all covered                                        |
| 2b  | Response checks     | pass    | pageProps equality + asPath assertions preserved                                                                                                       |
| 2c  | FS checks           | na      | buildId now from `next.buildId` instead of reading BUILD_ID file                                                                                       |
| 2d  | Browser checks      | na      |                                                                                                                                                        |
| 2e  | Build output        | pass    | `next.cliOutput` used to capture stdout `asPath` log                                                                                                   |
| 2f  | Dynamic logic       | na      | Single `runTests()` for production only                                                                                                                |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                     |
| 3c  | skipStart           | na      | Test needs running server for `/_next/data`                                                                                                            |
| 3d  | No manual lifecycle | pass    | No `killApp`/`findPort`/`nextBuild`/`nextStart`                                                                                                        |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                               |
| 4a  | Directory placement | pass    | test/production/ matches original's prod-only coverage                                                                                                 |
| 4b  | Mode guards         | na      | Prod-only test in prod folder                                                                                                                          |
| 4c  | Turbopack guards    | na      |                                                                                                                                                        |
| 4d  | Dedup guards        | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip : describe`; not preserved. Acceptable since test/production/ folder inherently skips dev mode |
| 4e  | No incorrect env    | pass    |                                                                                                                                                        |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render` / `next.render$`                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                                                        |
| 5c  | browser             | na      |                                                                                                                                                        |
| 5d  | check→retry         | pass    | `check()` replaced with `retry()` + `expect()`                                                                                                         |
| 5e  | File class          | na      |                                                                                                                                                        |
| 5f  | waitFor             | pass    | `waitFor(1000)` replaced with `retry()` polling                                                                                                        |
| 5g  | fs operations       | pass    | `fs.readFile(BUILD_ID)` → `next.buildId`                                                                                                               |
| 6a  | Fixtures exist      | pass    | pages/\_app.js, pages/index.js, pages/another/index/index.js present                                                                                   |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                      |
| 6c  | Overrides           | na      |                                                                                                                                                        |
| 7a  | No dead code        | pass    |                                                                                                                                                        |
| 7b  | retry over timeout  | pass    |                                                                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                                                                        |

## Issues

None

## Warnings

- 4d: Original dedup guard (`process.env.TURBOPACK_DEV ? describe.skip : describe`) wasn't ported. This is effectively redundant since placement in `test/production/` already prevents dev-mode execution, so no behavior change.
