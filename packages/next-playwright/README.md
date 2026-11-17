# @next/playwright

Experimental Playwright helpers for testing Next.js applications with Cache Components.

`instant()` pauses dynamic server content while a test asserts on the initial or
prefetched UI. Content resumes when the callback finishes.

See the [API reference](https://nextjs.org/docs/app/api-reference/functions/instant)
for installation, parameters, production setup and navigation caveats. The
[Instant Navigation guide](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests)
shows how to use the helper to prevent regressions in an app.
