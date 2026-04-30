# link-without-router: WARN

This is a pure jsdom component test (not a traditional e2e test) — the converted file drops the dev/prod duplicate describe blocks from the original, which were dedup guards for identical assertions, so behavioral coverage is preserved but test count dropped.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                 |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | warn    | original: 2, converted: 1 (originals were identical, gated by `TURBOPACK_BUILD`/`TURBOPACK_DEV` for dedup)                                                           |
| 1b  | Assertions          | warn    | original: 2, converted: 1 (same reason as 1a)                                                                                                                        |
| 1c  | Test titles         | pass    | "should not throw when rendered" preserved                                                                                                                           |
| 1d  | Describe blocks     | warn    | "development mode" / "production mode" nested describes dropped; acceptable because they only existed as turbopack dedup guards around identical tests               |
| 2a  | URL paths           | na      | jsdom component render, no URL access                                                                                                                                |
| 2b  | Response checks     | na      |                                                                                                                                                                      |
| 2c  | FS checks           | na      |                                                                                                                                                                      |
| 2d  | Browser checks      | na      | uses `@testing-library/react`, not webdriver                                                                                                                         |
| 2e  | Build output        | na      |                                                                                                                                                                      |
| 2f  | Dynamic logic       | na      | original had no `runTests(mode)` helper                                                                                                                              |
| 3a  | nextTestSetup       | na      | pure jsdom component test; no Next.js server/browser needed, so nextTestSetup is not applicable                                                                      |
| 3b  | files param         | na      | no fixture loader; component imported directly                                                                                                                       |
| 3c  | skipStart           | na      |                                                                                                                                                                      |
| 3d  | No manual lifecycle | pass    | no disallowed lifecycle imports                                                                                                                                      |
| 3e  | Cleanup             | pass    | no cleanup needed                                                                                                                                                    |
| 4a  | Directory placement | warn    | placed in `test/e2e/` but it's a jsdom unit test with no Next.js server interaction — arguably belongs in `test/unit/`                                               |
| 4b  | Mode guards         | na      | test is mode-agnostic (jsdom only)                                                                                                                                   |
| 4c  | Turbopack guards    | warn    | original had `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards; converted has none, but since this is a jsdom test that doesn't touch the bundler, guards aren't needed |
| 4d  | Dedup guards        | warn    | original dedup removed (see 4c); effectively fine because the test doesn't exercise the bundler                                                                      |
| 4e  | No incorrect env    | pass    | no env guards in converted                                                                                                                                           |
| 5a  | render              | na      |                                                                                                                                                                      |
| 5b  | fetch               | na      |                                                                                                                                                                      |
| 5c  | browser             | na      |                                                                                                                                                                      |
| 5d  | check→retry         | na      |                                                                                                                                                                      |
| 5e  | File class          | na      |                                                                                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                                                                      |
| 5g  | fs operations       | na      |                                                                                                                                                                      |
| 6a  | Fixtures exist      | pass    | `components/hello.js` present in converted dir                                                                                                                       |
| 6b  | next.config.js      | na      | original had no `next.config.js`                                                                                                                                     |
| 6c  | Overrides           | na      |                                                                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                                                                      |
| 7b  | retry over timeout  | na      | synchronous test                                                                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                                                                                      |
| 7d  | eslint              | pass    | no duplicate titles now that dedup describes are gone                                                                                                                |

## Issues

None (no fail-level problems).

## Warnings

- Test count dropped 2 → 1 because the original had duplicate `it('should not throw when rendered', ...)` under `development mode` / `production mode` describes, only to dedup across turbopack-dev and turbopack-build CI runs. The converted file collapses these into a single test, which is functionally equivalent since the test itself is bundler-agnostic (jsdom render of a component), but reviewers should confirm the intentional loss of the dedup describes.
- Placement in `test/e2e/` is questionable — this is a pure jsdom component render with no Next.js server, browser, build, or bundler interaction. `test/unit/` would arguably be the more appropriate location. The original also lived in `test/integration/` despite not being a true integration test, so the conversion inherits that oddity.
