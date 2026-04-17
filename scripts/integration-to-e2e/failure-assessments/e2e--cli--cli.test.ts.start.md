# cli: PRE-EXISTING

## Summary

The failures are primarily due to pre-existing framework issues and behavioral changes unrelated to the test conversion. The main issues are: (1) a React runtime error during prerendering with "Cannot read properties of null (reading 'useContext')", which appears to be a framework-level bug affecting static generation, (2) changed CLI output format that now shows actual process IDs instead of "unknown process", and (3) npm configuration warnings in the test environment that contaminate stderr output.

## Evidence

**Framework runtime error**: Multiple tests fail during the build step with `TypeError: Cannot read properties of null (reading 'useContext')` occurring during static page generation. This is a React runtime issue during prerendering, not a test conversion problem. The fixture files are simple and valid - the basic fixture exports a plain function `export default () => 'test'` and the duplicate-sass fixture exports a standard React component.

**CLI behavior change**: The test expects `⚠ Port 3000 is in use by an unknown process` but receives `⚠ Port 3000 is in use by process 28950`. This indicates the CLI now reports actual process IDs instead of the generic "unknown process" message.

**Infrastructure stderr pollution**: The info command test fails because stderr contains npm configuration warnings like `npm warn unknown env config "npm-globalconfig"` and `npm error code enoworkspaces`, which the test doesn't expect.

**Test conversion quality**: The conversion itself appears correct - it properly uses `nextTestSetup`, replaces deprecated `check()` calls with `retry()`, and maintains the same test structure and assertions as the original.

## Fix suggestion

Since this is PRE-EXISTING: The useContext error during prerendering indicates a framework bug in React context handling during static generation. The CLI message format change and npm stderr warnings are environmental/behavioral changes unrelated to the test conversion. These issues would likely manifest in the original integration test as well.
