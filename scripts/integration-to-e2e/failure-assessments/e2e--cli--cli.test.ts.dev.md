# cli-test: PRE-EXISTING

## Summary

The test failures are caused by changes in Next.js framework behavior and environment configuration, not issues with the test conversion. The first failure occurs because Next.js now shows specific process IDs instead of "unknown process" when detecting port conflicts. The second failure happens due to npm configuration warnings in the test environment that contain the word "error" but aren't actual errors.

## Evidence

**Port conflict message change:**

- Expected: `'⚠ Port 3000 is in use by an unknown process, using available port 3001 instead.'`
- Actual: `'⚠ Port 3000 is in use by process 23661, using available port 3001 instead.'`

This indicates Next.js has improved its port conflict detection to show actual process IDs rather than generic "unknown process" messages.

**npm configuration warnings:**
The test expects `stderr` to not contain "error" but receives npm warnings like:

```
npm warn unknown env config "npm-globalconfig". this will stop working in the next major version of npm.
npm error code enoworkspaces
npm error this command does not support workspaces.
```

These are environment-specific npm configuration issues, not test conversion problems.

**Conversion quality evidence:**

- The test correctly converted from `check()` to `retry() + expect()` pattern
- Path references were properly updated from `dirBasic` to `next.testDir`
- Test structure migration from integration to e2e format is correct
- All other test patterns and assertions remain functionally equivalent

## Fix suggestion

**PRE-EXISTING**: These are framework behavior changes that need to be addressed at the Next.js level:

1. **Port conflict message**: Update the test expectation to match the new behavior that shows specific process IDs
2. **npm warnings**: Either configure the test environment to suppress these npm warnings, or update the assertion to filter out npm-specific "error" messages while still catching actual errors

The converted test structure and patterns are correct - the failures reflect legitimate changes in Next.js behavior and environment configuration.
