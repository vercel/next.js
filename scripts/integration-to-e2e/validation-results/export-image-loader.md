# export-image-loader: WARN

Tests were consolidated from 9 to 5 (build + HTML check merged per scenario); all assertions preserved, fixtures intact, lifecycle correct.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                    |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | warn    | original: 9, converted: 5 (build+html merged per scenario)                                                              |
| 1b  | Assertions          | pass    | original: ~6 expects, converted: 10 expects                                                                             |
| 1c  | Test titles         | warn    | "should build successfully" / "should contain img" merged into single titles like "should build with cloudinary loader" |
| 1d  | Describe blocks     | warn    | 5 top-level describes flattened into 1 with 5 `it`s; acceptable simplification                                          |
| 2a  | URL paths           | na      | No HTTP requests; static export HTML only                                                                               |
| 2b  | Response checks     | pass    | All cheerio/HTML assertions preserved                                                                                   |
| 2c  | FS checks           | pass    | `fs.readFile(outdir)` → `next.readFile('out/index.html')`                                                               |
| 2d  | Browser checks      | na      |                                                                                                                         |
| 2e  | Build output        | pass    | `nextBuild` → `next.build()`, `stderr` → `next.cliOutput`                                                               |
| 2f  | Dynamic logic       | na      |                                                                                                                         |
| 3a  | nextTestSetup       | pass    |                                                                                                                         |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                      |
| 3c  | skipStart           | pass    | `skipStart: true` for build-only tests                                                                                  |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`killApp` imports                                                                                        |
| 3e  | Cleanup             | pass    | `afterEach` restores files in isolated copy; original File.restore replaced properly                                    |
| 4a  | Directory placement | pass    | `test/production/` correct for build-only                                                                               |
| 4b  | Mode guards         | na      |                                                                                                                         |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV` skip is obsolete in prod-only location                                                         |
| 4d  | Dedup guards        | na      |                                                                                                                         |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` usage                                                                              |
| 5a  | render              | na      |                                                                                                                         |
| 5b  | fetch               | na      |                                                                                                                         |
| 5c  | browser             | na      |                                                                                                                         |
| 5d  | check→retry         | na      |                                                                                                                         |
| 5e  | File class          | pass    | `new File(...)` → `next.patchFile()`                                                                                    |
| 5f  | waitFor             | na      |                                                                                                                         |
| 5g  | fs operations       | pass    | `fs.readFile(join(outdir, ...))` → `next.readFile('out/...')`                                                           |
| 6a  | Fixtures exist      | pass    | pages/index.js, next.config.js, dummy-loader.js all present                                                             |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                                  |
| 6c  | Overrides           | na      |                                                                                                                         |
| 7a  | No dead code        | pass    |                                                                                                                         |
| 7b  | retry over timeout  | na      |                                                                                                                         |
| 7c  | async/await         | pass    |                                                                                                                         |
| 7d  | eslint              | pass    |                                                                                                                         |

## Issues

None.

## Warnings

- Test count reduced from 9 to 5: the separate "should build successfully" and "should contain img element" tests were merged into a single test per scenario. Behavior is equivalent (build + html inspection) and assertions are all preserved, but granularity is lost — a build failure and a missing element now surface in the same test.
- 5 sibling describes flattened into 1 describe with 5 `it`s. Consistent with the consolidation above.
