# ondemand: WARN

Conversion is faithful and behaviorally equivalent; only a trivial `should pass` placeholder test was dropped.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                     |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | warn    | original: 5, converted: 4 (dropped trivial `it('should pass', () => {})` placeholder)                                    |
| 1b  | Assertions          | pass    | original: 5, converted: 9                                                                                                |
| 1c  | Test titles         | warn    | `should pass` dropped; all meaningful titles preserved                                                                   |
| 1d  | Describe blocks     | pass    | Single `On Demand Entries` describe preserved                                                                            |
| 2a  | URL paths           | pass    | `/`, `/about`, `/third`, `/nav`, `/_next/<pageFile>` all covered                                                         |
| 2b  | Response checks     | pass    | Index/About page content checks preserved; added pageFile assertions                                                     |
| 2c  | FS checks           | pass    | `getBuildManifest(appDir)` → `next.readFile('.next/dev/build-manifest.json')`                                            |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`, click + text check preserved                                                               |
| 2e  | Build output        | na      | No build output checks                                                                                                   |
| 2f  | Dynamic logic       | na      | No dev/prod branching                                                                                                    |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils` with custom `startCommand`                                                         |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                       |
| 3c  | skipStart           | na      | Uses custom server, not build-only                                                                                       |
| 3d  | No manual lifecycle | pass    | No `killApp`/`initNextServerScript` — replaced with `startCommand`                                                       |
| 3e  | Cleanup             | pass    | nextTestSetup handles teardown                                                                                           |
| 4a  | Directory placement | pass    | `test/development/` appropriate — ondemand is dev-only                                                                   |
| 4b  | Mode guards         | na      | Dev-only feature                                                                                                         |
| 4c  | Turbopack guards    | pass    | `(shouldUseTurbopack() ? describe.skip : describe)` wraps outside `nextTestSetup`                                        |
| 4d  | Dedup guards        | na      |                                                                                                                          |
| 4e  | No incorrect env    | pass    | Uses `shouldUseTurbopack()` helper                                                                                       |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                          |
| 5b  | fetch               | na      | Not used                                                                                                                 |
| 5c  | browser             | pass    | `webdriver` → `next.browser`                                                                                             |
| 5d  | check→retry         | pass    | `check()` → `retry()` + `expect()`                                                                                       |
| 5e  | File class          | na      |                                                                                                                          |
| 5f  | waitFor             | pass    | `waitFor`+loop → `retry(fn, 30_000, 1000)`                                                                               |
| 5g  | fs operations       | pass    | `getBuildManifest(appDir)` → `next.readFile(...)`                                                                        |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/about.js, pages/third.js, pages/nav/\*, components/hello.js, next.config.js, server.js all present |
| 6b  | next.config.js      | pass    | Present in fixture directory                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                          |
| 7a  | No dead code        | pass    |                                                                                                                          |
| 7b  | retry over timeout  | pass    |                                                                                                                          |
| 7c  | async/await         | pass    |                                                                                                                          |
| 7d  | eslint              | pass    |                                                                                                                          |

## Issues

None

## Warnings

- The original's `it('should pass', () => {})` placeholder test was not carried over. It was a no-op used alongside the original's manual `beforeAll`/`startServer` lifecycle and carries no behavioral value — safe to omit, but noted for count parity.
- Converted `server.js` logs `- Local:` instead of `> Ready on` and internally calls `getPort()` rather than reading `process.env.PORT`. Functionally equivalent with `serverReadyPattern: /- Local:/`.
