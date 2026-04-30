# relay-graphql-swc-single-project: PASS

Clean conversion: dual dev/prod describe blocks collapsed into a single e2e test with the canonical dedup guard; fixtures present; relay-compiler invoked via `installCommand`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                           |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------- | --- | ----------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                      |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                      |
| 1c  | Test titles         | pass    | "should resolve index page correctly" preserved                                                |
| 1d  | Describe blocks     | pass    | Two mode-specific describes collapsed; mode coverage preserved via dedup guard                 |
| 2a  | URL paths           | pass    | `/` covered                                                                                    |
| 2b  | Response checks     | pass    | `toContain('Hello, World!')` preserved                                                         |
| 2c  | FS checks           | na      |                                                                                                |
| 2d  | Browser checks      | na      |                                                                                                |
| 2e  | Build output        | na      |                                                                                                |
| 2f  | Dynamic logic       | pass    | `runTests()` helper was identical dev/prod; single inlined test is equivalent                  |
| 3a  | nextTestSetup       | pass    |                                                                                                |
| 3b  | files param         | pass    | `files: __dirname`                                                                             |
| 3c  | skipStart           | na      | Runs in both dev and start                                                                     |
| 3d  | No manual lifecycle | pass    |                                                                                                |
| 3e  | Cleanup             | pass    |                                                                                                |
| 4a  | Directory placement | pass    | `test/e2e/` correct since original ran in both modes                                           |
| 4b  | Mode guards         | na      | Same behavior for both modes                                                                   |
| 4c  | Turbopack guards    | pass    | Dedup guard wraps outside nextTestSetup                                                        |
| 4d  | Dedup guards        | pass    | `(isNextDev && TURBOPACK_BUILD)                                                                |     | (isNextStart && TURBOPACK_DEV)` preserved |
| 4e  | No incorrect env    | pass    | Use is the allowed dedup-guard pattern                                                         |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render()`                                                              |
| 5b  | fetch               | na      |                                                                                                |
| 5c  | browser             | na      |                                                                                                |
| 5d  | check→retry         | na      |                                                                                                |
| 5e  | File class          | na      |                                                                                                |
| 5f  | waitFor             | na      |                                                                                                |
| 5g  | fs operations       | pass    | `execSync` relay-compiler replaced with `installCommand: 'pnpm install && npx relay-compiler'` |
| 6a  | Fixtures exist      | pass    | pages/, queries/, schema.graphql, relay.config.js, next.config.js, tsconfig.json all present   |
| 6b  | next.config.js      | pass    | Present                                                                                        |
| 6c  | Overrides           | na      |                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                |
| 7b  | retry over timeout  | na      |                                                                                                |
| 7c  | async/await         | pass    |                                                                                                |
| 7d  | eslint              | pass    |                                                                                                |

## Issues

None

## Warnings

None
