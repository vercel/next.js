All 5 tests pass.

# e2e--css-client-nav--css-client-nav.test.ts.start: FIXED

## Root cause

Turbopack production builds emit CSS URLs under `/_next/static/immutable/chunks/*.css`, which in this codebase are served with routing that the proxy receives as `req.url`. The converted test used `req.url.endsWith('.css')` for the stall check, but the original integration test parsed the URL and checked `pathname.endsWith('.css')`. While query strings weren't the specific trigger here, the stall detection in the converted test was never matching any of the actual CSS requests (as evidenced by zero "stalling request for" log lines and a 209ms run time, far below the 3.8s timeout). Restoring pathname-based matching (identical to the original) makes the proxy correctly delay CSS responses, triggering the hard-navigation timeout.

## Fix applied

- `test/e2e/css-client-nav/css-client-nav.test.ts`: Changed `req.url.endsWith('.css')` to `new URL(req.url, next.url).pathname.endsWith('.css')` to match the original integration test's CSS-detection logic; also removed an unused `nextUrl` local.

## Verification

Running the verification command yields `Tests: 5 passed, 5 total` — including the previously-failing `should time out and hard navigate for stalled CSS request` (15896 ms, showing the full 5s stall + 3.8s timeout elapsed as expected). Proxy logs now show `stalling request for /_next/static/immutable/chunks/*.css`, confirming the stall is active.
