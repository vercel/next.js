# import-assertion: WARN

Conversion is faithful to the single test, but the original `next.config.js` (setting `typescript.ignoreBuildErrors: true`) was not copied into the converted fixture — this may cause TS build errors in prod mode.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                  |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                                             |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                                             |
| 1c  | Test titles         | pass    | "should handle json assertions" preserved                                                                                             |
| 1d  | Describe blocks     | pass    | runDevSuite/runProdSuite replaced by single describe running in both modes                                                            |
| 2a  | URL paths           | pass    | /es and /ts both accessed via next.render                                                                                             |
| 2b  | Response checks     | pass    | Same toContain assertions preserved                                                                                                   |
| 2c  | FS checks           | na      |                                                                                                                                       |
| 2d  | Browser checks      | na      |                                                                                                                                       |
| 2e  | Build output        | na      |                                                                                                                                       |
| 2f  | Dynamic logic       | na      | `basic` helper inlined, no dev/prod branches                                                                                          |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from 'e2e-utils'                                                                                                   |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                    |
| 3c  | skipStart           | na      | Not a build-only test                                                                                                                 |
| 3d  | No manual lifecycle | pass    |                                                                                                                                       |
| 3e  | Cleanup             | pass    | No extra cleanup needed                                                                                                               |
| 4a  | Directory placement | pass    | test/e2e/ correct (ran in both dev and prod originally)                                                                               |
| 4b  | Mode guards         | na      | Same behavior in both modes                                                                                                           |
| 4c  | Turbopack guards    | na      |                                                                                                                                       |
| 4d  | Dedup guards        | na      |                                                                                                                                       |
| 4e  | No incorrect env    | pass    |                                                                                                                                       |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                                                           |
| 5b  | fetch               | na      |                                                                                                                                       |
| 5c  | browser             | na      |                                                                                                                                       |
| 5d  | check→retry         | na      |                                                                                                                                       |
| 5e  | File class          | na      |                                                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                                       |
| 5g  | fs operations       | na      |                                                                                                                                       |
| 6a  | Fixtures exist      | pass    | pages/es.js, pages/ts.ts, data, data.d.ts, tsconfig.json present                                                                      |
| 6b  | next.config.js      | warn    | Original `next.config.js` with `typescript.ignoreBuildErrors: true` is NOT in converted fixture and no `nextConfig` override provided |
| 6c  | Overrides           | na      |                                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                                       |
| 7b  | retry over timeout  | na      |                                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                                       |

## Issues

None

## Warnings

- `next.config.js` from `test/integration/import-assertion/next.config.js` sets `typescript.ignoreBuildErrors: true` because the test uses `import ... assert { type: 'json' }` syntax that is unsupported in newer TypeScript versions. The converted fixture directory does not contain this config (and no `nextConfig` was passed to `nextTestSetup`). In prod mode this may cause a TypeScript build error for `pages/ts.ts`. Consider copying the `next.config.js` into `test/e2e/import-assertion/` or passing `nextConfig: { typescript: { ignoreBuildErrors: true } }`.
