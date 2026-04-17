# config-syntax-error: CONVERSION-BUG

## Summary

The test failure is caused by improper test conversion. The second test case expects an error message referencing "next.config.mjs" but receives an error about "next.config.js" instead. This happens because the converted test doesn't clean up the `next.config.js` file created by the first test, and Next.js prioritizes `.js` config files over `.mjs` files, causing the second test to load the wrong config file.

## Evidence

1. **Expected vs Actual Error Message**: The test expects "Failed to load next.config.mjs" but gets "Failed to load next.config.js"

2. **Original Test Behavior**: In the original integration test, each test case:
   - Creates its specific config file (`next.config.js` or `next.config.mjs`)
   - Runs the test
   - **Explicitly removes the config file** with `await fs.remove(nextConfigJS/MJS)`

3. **Converted Test Behavior**: The converted test uses `next.patchFile()` to create both config files but doesn't clean up between tests, leaving both files present when the second test runs.

4. **Next.js Config Priority**: Next.js prioritizes `next.config.js` over `next.config.mjs` when both are present, explaining why the second test sees the `.js` file error.

## Fix suggestion

The converted test needs to clean up config files between test cases. Add cleanup logic to remove the config file after each test, or better yet, restructure the tests to avoid file conflicts:

```typescript
it('should error when next.config.mjs contains syntax error', async () => {
  // Remove any existing config files first
  await next.deleteFile('next.config.js').catch(() => {})

  await next.patchFile(
    'next.config.mjs',
    `
  const config = {
    reactStrictMode: true,,
  }
  export default config
`
  )
  await next.build()

  expect(next.cliOutput).toContain(
    'Failed to load next.config.mjs, see more info here https://nextjs.org/docs/messages/next-config-error'
  )
  expect(next.cliOutput).toContain('SyntaxError')
})
```
