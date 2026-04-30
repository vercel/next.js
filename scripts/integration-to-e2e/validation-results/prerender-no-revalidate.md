# prerender-no-revalidate: WARN

Conversion is structurally complete with all tests and assertions preserved, but the TURBOPACK_DEV dedup guard from the original was dropped.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                           |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 8 (4 × 2), converted: 8 (4 × 2)                                                                                      |
| 1b  | Assertions          | pass    | original: 56, converted: 56                                                                                                    |
| 1c  | Test titles         | pass    | All 8 titles preserved exactly                                                                                                 |
| 1d  | Describe blocks     | pass    | Nested "production mode" describe flattened since test/production/ is prod-only                                                |
| 2a  | URL paths           | pass    | All 4 routes + `/_next/data/{buildId}{path}.json` preserved                                                                    |
| 2b  | Response checks     | pass    | HTML content + JSON data equality preserved                                                                                    |
| 2c  | FS checks           | pass    | `fs.readFile(join(appDir, '.next/server/...'))` → `next.readFile('.next/server/pages{path}.html')`                             |
| 2d  | Browser checks      | na      |                                                                                                                                |
| 2e  | Build output        | pass    | `stderr` → `next.cliOutput` check for 'GSP was re-run' preserved                                                               |
| 2f  | Dynamic logic       | na      | Single mode                                                                                                                    |
| 3a  | nextTestSetup       | pass    |                                                                                                                                |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                             |
| 3c  | skipStart           | na      | Test needs a running server (data routes)                                                                                      |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/etc.                                                                                                       |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                       |
| 4a  | Directory placement | pass    | test/production/ matches prod-only original                                                                                    |
| 4b  | Mode guards         | na      |                                                                                                                                |
| 4c  | Turbopack guards    | na      |                                                                                                                                |
| 4d  | Dedup guards        | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip : describe` wrapping production mode; converted drops this dedup guard |
| 4e  | No incorrect env    | pass    |                                                                                                                                |
| 5a  | render              | pass    | `renderViaHTTP(appPort, route)` → `next.render(route)`                                                                         |
| 5b  | fetch               | na      |                                                                                                                                |
| 5c  | browser             | na      |                                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                                |
| 5e  | File class          | na      |                                                                                                                                |
| 5f  | waitFor             | pass    | `waitFor(500)` retained appropriately (verifying NO change during delay, not polling)                                          |
| 5g  | fs operations       | pass    | Replaced direct fs + appDir with `next.readFile()`                                                                             |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/named.js, pages/nested/index.js, pages/nested/named.js all present                                       |
| 6b  | next.config.js      | na      | Original had none                                                                                                              |
| 6c  | Overrides           | na      |                                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                                |
| 7b  | retry over timeout  | pass    | waitFor usage is intentional (negative-assertion timing)                                                                       |
| 7c  | async/await         | pass    |                                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                                |

## Issues

None.

## Warnings

- **4d**: Original wrapped the production-mode describe with `;(process.env.TURBOPACK_DEV ? describe.skip : describe)` to prevent running in the TURBOPACK_DEV CI job. The converted test lacks this guard, so it will now run in that job. Consider wrapping the top-level `describe` with `;(process.env.TURBOPACK_DEV ? describe.skip : describe)` to preserve CI dedup behavior.
- Hardcoded path assumption `.next/server/pages${pagePath}.html` replaces the original's `getPageFileFromPagesManifest()` lookup. This is simpler but brittle if the pages manifest format changes; acceptable for a fixture like this but worth noting.
