# api-body-parser: CONVERSION-BUG

## Summary

The test failure is caused by improper port management in the converted test setup. The `nextTestSetup` infrastructure is not correctly passing the allocated port to the custom server via environment variables, resulting in the server starting on port 0 (or undefined), which causes URL parsing errors when the test framework tries to construct request URLs.

## Evidence

Key evidence pointing to a conversion bug:

1. **Port allocation issue**: The server logs show `Ready on http://localhost:0`, indicating the PORT environment variable is 0 or undefined
2. **URL parsing error**: `TypeError: Invalid URL` with input 'undefined' suggests the test framework can't construct proper URLs with an invalid port
3. **Missing port configuration**: The converted test uses `nextTestSetup` with `startCommand: 'node server.js'` but doesn't ensure port allocation is passed to the custom server
4. **Original vs converted approach**: The original test explicitly managed ports with `getPort()` and passed them via environment variables: `{ PORT: '${appPort}', CUSTOM_SERVER: 'true' }`, while the converted test only sets `env: { CUSTOM_SERVER: 'true' }`
5. **File handle exhaustion**: The "EMFILE: too many open files, watch" errors are likely caused by repeated failed startup attempts

## Fix suggestion

The `nextTestSetup` configuration for the custom server tests needs to be updated to properly handle port allocation. This could be done by:

1. Ensuring the `nextTestSetup` infrastructure passes the allocated port to custom servers via environment variables when using `startCommand`
2. Or alternatively, modifying the test to use a different approach that properly manages the port lifecycle for custom servers
3. The server.js file expects a PORT environment variable, but `nextTestSetup` isn't providing it when using `startCommand`

The root issue is that the conversion from the manual port management in the integration test to the automatic port management in `nextTestSetup` is incomplete for custom server scenarios.
