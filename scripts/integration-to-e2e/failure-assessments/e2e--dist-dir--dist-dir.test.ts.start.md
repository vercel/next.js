# dist-dir: CONVERSION-BUG

## Summary

The failure is caused by incorrect test conversion. The original integration test had standalone tests for invalid/undefined distDir that used `nextBuild()` directly without a running server. The converted e2e test tries to call `next.build()` while a server is already running from `nextTestSetup()`, which is not allowed by the NextStartInstance.

## Evidence

1. **Error message**: "can not run export while server is running, use next.stop() first" clearly indicates a server is running when trying to build.

2. **Original test structure**: The failing tests (`should throw error with invalid distDir` and `should handle undefined distDir`) were in a separate describe block (lines 82-112) that used `nextBuild(appDir, [], { stderr: true })` directly without any server setup.

3. **Converted test structure**: These same tests (lines 27-36 and 38-48) are now within the main describe block that has `nextTestSetup()` running a server, and they call `next.build()` which conflicts with the running server.

4. **Different approaches**: Original used standalone `nextBuild()` and checked `stderr`, converted tries to use `next.build()` on a live instance and checks `cliOutput`.

## Fix suggestion

Move the failing tests to a separate describe block with their own isolated test setup that doesn't start a server, similar to the original structure:

```typescript
describe('distDir config validation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true, // Don't start server automatically
  })

  it('should throw error with invalid distDir', async () => {
    // Test logic here
  })

  it('should handle undefined distDir', async () => {
    // Test logic here
  })
})
```

Or alternatively, stop the server before building and restart if needed within the existing tests.
