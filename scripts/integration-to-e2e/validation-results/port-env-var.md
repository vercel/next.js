# port-env-var: WARN

Conversion preserves the basic render assertion but collapses dev+prod invocations into a single test and no longer explicitly sets the PORT env var (relying on nextTestSetup's internal port management to exercise the same behavior).

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                           |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | warn    | original: 2 (runTests() called twice for dev+prod), converted: 1 (nextTestSetup matrix covers both modes)                      |
| 1b  | Assertions          | warn    | original: 2, converted: 1                                                                                                      |
| 1c  | Test titles         | pass    | "should serve on the configured port" preserved                                                                                |
| 1d  | Describe blocks     | warn    | Inner dev/prod describe blocks dropped; relies on matrix runs                                                                  |
| 2a  | URL paths           | pass    | `/` tested                                                                                                                     |
| 2b  | Response checks     | warn    | Body assertion preserved, but PORT env var is no longer explicitly set by the test (nextTestSetup assigns the port internally) |
| 2c  | FS checks           | na      |                                                                                                                                |
| 2d  | Browser checks      | na      |                                                                                                                                |
| 2e  | Build output        | na      |                                                                                                                                |
| 2f  | Dynamic logic       | pass    | `runTests()` body inlined                                                                                                      |
| 3a  | nextTestSetup       | pass    |                                                                                                                                |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                             |
| 3c  | skipStart           | na      | Not build-only                                                                                                                 |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/runNextCommandDev                                                                                          |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                       |
| 4a  | Directory placement | pass    | `test/e2e/` — runs dev + prod                                                                                                  |
| 4b  | Mode guards         | pass    | Not needed; same behavior in both modes                                                                                        |
| 4c  | Turbopack guards    | pass    | Original TURBOPACK_DEV/BUILD dedup guards intentionally dropped since single-mode test runs in matrix                          |
| 4d  | Dedup guards        | na      |                                                                                                                                |
| 4e  | No incorrect env    | pass    |                                                                                                                                |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                |
| 5b  | fetch               | na      |                                                                                                                                |
| 5c  | browser             | na      |                                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                                |
| 5e  | File class          | na      |                                                                                                                                |
| 5f  | waitFor             | na      |                                                                                                                                |
| 5g  | fs operations       | na      |                                                                                                                                |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                                                                                       |
| 6b  | next.config.js      | warn    | Original had empty `module.exports = {}`; not copied but harmless                                                              |
| 6c  | Overrides           | na      |                                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                                |
| 7b  | retry over timeout  | na      |                                                                                                                                |
| 7c  | async/await         | pass    |                                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                                |

## Issues

None

## Warnings

- Converted test does not explicitly set `PORT` env var in any setup hook — the original's core purpose was to verify the `PORT` env variable configures the server port. `nextTestSetup` handles port assignment internally, so the spirit of the test is partially preserved but the explicit PORT env override path is no longer directly exercised.
- Original `next.config.js` (`module.exports = {}`) not copied into the fixture directory; effectively no-op but worth noting for fidelity.
- Test count reduced from 2 (dev + prod inner describes) to 1; relies on the dev/prod matrix to cover both modes.
