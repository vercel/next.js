# telemetry: CONVERSION-BUG

## Summary

The test failure is caused by missing `package.json` file in the converted e2e test fixtures. The `next build` commands are failing (exit code 1) because they cannot find a valid Next.js project configuration, which prevents telemetry events from being emitted. The test then fails when trying to parse non-existent telemetry events from stderr, causing `TypeError: Cannot read properties of null (reading 'pop')`.

## Evidence

1. **Repeated build failures**: The error output shows multiple instances of "process exited with code 1 and signal null" from `next build` commands
2. **Missing package.json**: The e2e test directory `/test/e2e/telemetry/` lacks a `package.json` file, while all other files were copied from the integration test
3. **Regex parsing failure**: The failing tests all have the same pattern - regex `.exec(stderr)` returns `null` because expected telemetry events (`NEXT_BUILD_OPTIMIZED`) are never emitted from failed builds
4. **Working vs failing tests**: Simple telemetry CLI tests pass (don't require builds), while production mode tests that require builds all fail

## Fix suggestion

Create a `package.json` file in `/test/e2e/telemetry/package.json` with minimal Next.js dependencies:

```json
{
  "name": "telemetry-test",
  "private": true,
  "scripts": {
    "build": "next build",
    "dev": "next dev"
  },
  "dependencies": {
    "next": "workspace:*",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

This will allow the build commands to succeed and emit the expected telemetry events that the tests are trying to parse.
