# e2e--custom-server--custom-server.test.ts.dev: FIXED

## Root cause

The `with a custom fetch polyfill` tests set `POLYFILL_FETCH=true`, which causes `server.js` to `require('node-fetch')`. In the original integration test, `initNextServerScript` ran within the monorepo so `node-fetch` was resolvable via the hoisted workspace `node_modules`. In the converted `nextTestSetup` flow, fixtures are installed into an isolated directory with only declared `dependencies` — `node-fetch` was never declared, so the custom server process exited with code 1 at require time.

## Fix applied

- `test/e2e/custom-server/custom-server.test.ts`: Added `'node-fetch': '2.6.7'` to the `dependencies` for the `with a custom fetch polyfill` describe block (matching the version pinned in the root `package.json`).

## Verification

Full test file: 37 passed, 6 skipped, 0 failed (previously 2 failed). Both previously-failing tests — `Custom Server HTTP › with a custom fetch polyfill › should serve internal file from render` and the HTTPS counterpart — now pass.
