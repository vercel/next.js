# relay-graphql-swc-multi-project: PASS

Conversion preserves the single test per project across both modes via `nextTestSetup`, with custom build/start commands to support the multi-project subdirectory layout.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                             |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 1 `it` × 4 invocations (A dev, B dev, A prod, B prod); converted: 2 `it` × 2 modes (dev/start) via nextTestSetup — equivalent coverage |
| 1b  | Assertions          | pass    | original: 2 in runTests (invoked 4x); converted: 4 total (2 per project) — equivalent                                                            |
| 1c  | Test titles         | pass    | "should resolve index page correctly" preserved                                                                                                  |
| 1d  | Describe blocks     | pass    | project-a / project-b describes preserved; dev/prod describes flattened since nextTestSetup handles mode                                         |
| 2a  | URL paths           | pass    | `/` tested in both                                                                                                                               |
| 2b  | Response checks     | pass    | `toContain(project)` and `toContain('Hello, World!')` preserved                                                                                  |
| 2c  | FS checks           | na      |                                                                                                                                                  |
| 2d  | Browser checks      | na      |                                                                                                                                                  |
| 2e  | Build output        | na      |                                                                                                                                                  |
| 2f  | Dynamic logic       | pass    | runTests helper inlined per-project; mode handled via nextTestSetup                                                                              |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                               |
| 3c  | skipStart           | na      | Test requires server                                                                                                                             |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp imports                                                                                                            |
| 3e  | Cleanup             | pass    | nextTestSetup handles it                                                                                                                         |
| 4a  | Directory placement | pass    | test/e2e/ correct since both dev+prod were covered                                                                                               |
| 4b  | Mode guards         | pass    | dev/start selected via NEXT_TEST_MODE through nextTestSetup; startCommand branches on isNextDev                                                  |
| 4c  | Turbopack guards    | pass    | shouldUseTurbopack() used to conditionally add --turbopack to dev command                                                                        |
| 4d  | Dedup guards        | na      | Original TURBOPACK_DEV/TURBOPACK_BUILD guards were mode-dedup; nextTestSetup's single-mode-per-run makes these redundant                         |
| 4e  | No incorrect env    | pass    | Uses shouldUseTurbopack(), not raw TURBOPACK\_\*                                                                                                 |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                                                                      |
| 5b  | fetch               | na      |                                                                                                                                                  |
| 5c  | browser             | na      |                                                                                                                                                  |
| 5d  | check→retry         | na      |                                                                                                                                                  |
| 5e  | File class          | na      |                                                                                                                                                  |
| 5f  | waitFor             | na      |                                                                                                                                                  |
| 5g  | fs operations       | pass    | execFileSync runs in **dirname (pre-copy) to regenerate **generated\_\_ files                                                                    |
| 6a  | Fixtures exist      | pass    | project-a/project-b with pages, next.config.js, **generated**, tsconfig; relay.config.js and schema.graphql at root                              |
| 6b  | next.config.js      | pass    | Present in each project subdirectory                                                                                                             |
| 6c  | Overrides           | pass    | Custom buildCommand/startCommand scoped per project via `pnpm --dir`; relay-runtime@13.0.2 added via dependencies                                |
| 7a  | No dead code        | pass    |                                                                                                                                                  |
| 7b  | retry over timeout  | na      |                                                                                                                                                  |
| 7c  | async/await         | pass    |                                                                                                                                                  |
| 7d  | eslint              | pass    | No duplicate titles (each is scoped in its own describe)                                                                                         |

## Issues

None

## Warnings

None
