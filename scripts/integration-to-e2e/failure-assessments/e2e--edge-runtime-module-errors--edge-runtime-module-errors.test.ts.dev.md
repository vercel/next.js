# edge-runtime-module-errors › development mode › Middleware importing unused 3rd party module › throws not-found module error and highlights the faulty line: PRE-EXISTING

## Summary

The test failure is caused by a pre-existing logical bug in the `expectModuleNotFoundProdError` function that exists in both the original integration test and the converted e2e test. The bug attempts to check if an array of Jest matcher objects contains a string, which will always fail because a string can never equal a matcher object like `expect.stringContaining(...)`.

## Evidence

1. **Original integration test has identical bug**: The original `expectModuleNotFoundProdError` function in `/test/integration/edge-runtime-module-errors/test/utils.js` lines 74-79 contains the same problematic logic:

   ```javascript
   const moduleNotFoundMessages = [
     expect.stringContaining(`Error: Cannot find module '${moduleName}'`),
     expect.stringContaining(getModuleNotFound(moduleName)),
   ]
   expect(moduleNotFoundMessages).toContainEqual(stripAnsi(output))
   ```

2. **Converted test faithfully copied the bug**: The converted e2e test has identical logic in lines 49-53 of `expectModuleNotFoundProdError` function.

3. **Test case exists in original**: The failing test case "importing unused 3rd party module" exists in the original integration test at `/test/integration/edge-runtime-module-errors/test/module-imports.test.ts` lines 209-240.

4. **Logical impossibility**: The line `expect(moduleNotFoundMessages).toContainEqual(stripAnsi(output))` checks if an array of Jest matchers contains a string, which is logically impossible since `expect.stringContaining()` returns a matcher object, not a string.

## Fix suggestion

The original framework bug is in the logic that should check if the output matches any expected pattern, rather than checking if an array contains the output. The correct logic should be something like:

```javascript
const hasExpectedError = moduleNotFoundMessages.some((pattern) =>
  pattern.asymmetricMatch(stripAnsi(output))
)
expect(hasExpectedError).toBe(true)
```

or more simply:

```javascript
expect(stripAnsi(output)).toMatch(
  /Error: Cannot find module|Module not found: Can't resolve/
)
```
