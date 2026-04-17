# script-loader: CONVERSION-BUG

## Summary

The failure is caused by incorrect test conversion that changed the "Error message is shown if Partytown is not installed locally" test from using `nextBuild()` to using `createNext()`. The converted test creates a new Next.js instance while the main `nextTestSetup()` instance is still running, causing a "createNext called without destroying previous instance" error. This destroys the main instance, causing subsequent tests to fail with "Next.js is no longer available".

## Evidence

1. **Error message**: `createNext called without destroying previous instance` occurs at line 231 in the partytown test
2. **Original vs converted approach**:
   - Original test used `nextBuild(appWithPartytownMissingDir, [], { stdout: true, stderr: true })` which just builds without creating an instance
   - Converted test uses `createNext({ files: join(__dirname, 'partytown-missing'), skipStart: true, dependencies: {} })` which creates a new instance
3. **Cascade failure**: After the partytown test fails and destroys the instance, subsequent tests fail with "Next.js is no longer available"
4. **Test structure conflict**: The main test suite uses `nextTestSetup()` to create a persistent instance, but the partytown test tries to create an additional instance

## Fix suggestion

Change the "Error message is shown if Partytown is not installed locally" test to use `nextBuild()` instead of `createNext()`:

```typescript
it('Error message is shown if Partytown is not installed locally', async () => {
  if (isNextDev) return

  const { code, stdout, stderr } = await next.build(
    join(__dirname, 'partytown-missing'),
    [],
    {
      stdout: true,
      stderr: true,
    }
  )

  const output = stdout + stderr
  expect(output.replace(/[\n\r]/g, '')).toMatch(
    /It looks like you're trying to use Partytown with next\/script but do not have the required package\(s\) installed.Please install Partytown by running:.*?(npm|pnpm|yarn) (install|add) (--save-dev|--dev) @builder.io\/partytownIf you are not trying to use Partytown, please disable the experimental "nextScriptWorkers" flag in next.config.js./
  )
})
```

This matches the original test's approach and avoids creating a conflicting instance.
