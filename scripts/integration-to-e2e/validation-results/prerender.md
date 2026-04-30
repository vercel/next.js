# prerender: PASS

Clean 1:1 conversion of both tests with proper migration from manual lifecycle to `nextTestSetup`, `check()` → `retry() + expect()`, and `fs` file mutation → `next.patchFile()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                           |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                      |
| 1b  | Assertions          | pass    | original: 4 expects + 3 check(), converted: 7 expects (check→expect migration)                 |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                 |
| 1d  | Describe blocks     | pass    | Both describe levels preserved                                                                 |
| 2a  | URL paths           | pass    | `/blog/post-1` preserved                                                                       |
| 2b  | Response checks     | pass    | toContain / toMatch preserved                                                                  |
| 2c  | FS checks           | pass    | Migrated to `next.patchFile()` with callback auto-restore                                      |
| 2d  | Browser checks      | na      | No webdriver usage                                                                             |
| 2e  | Build output        | na      | No build assertions                                                                            |
| 2f  | Dynamic logic       | na      | No runTests helper                                                                             |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                          |
| 3b  | files param         | pass    | `files: __dirname`                                                                             |
| 3c  | skipStart           | na      | Dev server test, not build-only                                                                |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                                                  |
| 3e  | Cleanup             | pass    | patchFile callback restores content                                                            |
| 4a  | Directory placement | pass    | `test/development/` matches `launchApp` (dev-only) in original                                 |
| 4b  | Mode guards         | na      | Dev-only test                                                                                  |
| 4c  | Turbopack guards    | na      | None needed                                                                                    |
| 4d  | Dedup guards        | na      |                                                                                                |
| 4e  | No incorrect env    | pass    |                                                                                                |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render()`                                                              |
| 5b  | fetch               | na      | Not used                                                                                       |
| 5c  | browser             | na      | Not used                                                                                       |
| 5d  | check→retry         | pass    | All three `check()` calls migrated to `retry() + expect()`                                     |
| 5e  | File class          | na      | Original used fs directly; converted uses `next.patchFile()`                                   |
| 5f  | waitFor             | na      |                                                                                                |
| 5g  | fs operations       | pass    | `fs.readFile`/`fs.writeFile` on `blogPage` → `next.patchFile()`                                |
| 6a  | Fixtures exist      | pass    | `pages/blog/[post]/index.js` present                                                           |
| 6b  | next.config.js      | pass    | Provided inline via `nextConfig` option (equivalent to original's `experimental: { cpus: 1 }`) |
| 6c  | Overrides           | pass    | `nextConfig` matches original, `dependencies.firebase` added for `import 'firebase/firestore'` |
| 7a  | No dead code        | pass    |                                                                                                |
| 7b  | retry over timeout  | pass    |                                                                                                |
| 7c  | async/await         | pass    |                                                                                                |
| 7d  | eslint              | pass    |                                                                                                |

## Issues

None

## Warnings

None
