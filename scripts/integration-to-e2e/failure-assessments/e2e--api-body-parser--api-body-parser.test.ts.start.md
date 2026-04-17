# api-body-parser: CONVERSION-BUG

## Summary

The test failure is caused by a conversion bug where the `PORT` environment variable is not being set for the custom server tests. The original integration test explicitly sets both `PORT` and `CUSTOM_SERVER` environment variables, but the converted test only sets `CUSTOM_SERVER`. This causes the test framework to be unable to determine the correct port for making HTTP requests, resulting in "Invalid URL" errors when trying to fetch from the server.

## Evidence

1. **Original test sets PORT**: In the original integration test, the `startServer` function explicitly sets: `{ PORT: `${appPort}`, CUSTOM_SERVER: 'true' }`

2. **Converted test missing PORT**: The converted test only sets: `env: { CUSTOM_SERVER: 'true' }`

3. **Server expects PORT variable**: The `server.js` file uses: `const port = process.env.PORT || 3000`

4. **Invalid URL error**: The error occurs in `fetchViaHTTP` when calling `getFullUrl(appPort, url)`, indicating the `appPort` is invalid/undefined

5. **Server output shows port issue**: The console output shows `> Ready on http://localhost:0`, suggesting the port assignment failed

## Fix suggestion

Update the `env` configuration in the converted test to include the `PORT` environment variable. The `nextTestSetup` framework should automatically assign a port and pass it to the custom server. If this isn't happening automatically, the test setup needs to be modified to explicitly set the `PORT` environment variable similar to how the original integration test worked.
