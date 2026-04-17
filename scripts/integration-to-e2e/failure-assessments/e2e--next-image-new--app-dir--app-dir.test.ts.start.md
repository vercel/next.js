# app-dir: CONVERSION-BUG

## Summary

The test conversion failed to properly handle the deployment layer (DPL) logic from the original integration test. The original test used `getDeploymentId()` to generate a `dpl` variable that was appended to all image URL expectations. The converted e2e test removed this logic and hardcoded URLs without the DPL parameter, but the application still generates URLs with `&dpl=test-dpl-id-1234`, causing URL match failures.

## Evidence

1. **Original test pattern**: The integration test at `/test/integration/next-image-new/app-dir/test/index.test.ts` consistently uses `${dpl}` in URL expectations:

   ```javascript
   dpl = getDeploymentId(appDir, mode === 'dev').getDeploymentIdQuery(true)
   expect(await getSrc(browser, id)).toBe(
     `/_next/image?url=%2Fwide.png&w=3840&q=75${dpl}`
   )
   ```

2. **Converted test issue**: The e2e test has hardcoded URLs without DPL:

   ```javascript
   expect(await getSrc(browser, id)).toBe(
     '/_next/image?url=%2Fwide.png&w=3840&q=75'
   )
   ```

3. **Actual vs Expected**: Test failures show the application generates URLs with DPL parameter:
   - Expected: `/_next/image?url=%2Fwide.png&w=3840&q=75`
   - Received: `/_next/image?url=%2Fwide.png&w=3840&q=75&dpl=test-dpl-id-1234`

4. **Missing import**: The converted test doesn't import `getDeploymentId` from `next-test-utils`.

## Fix suggestion

The converted test needs to:

1. Import `getDeploymentId` from `next-test-utils`
2. Set up the `dpl` variable in the test setup using `getDeploymentId()`
3. Update all hardcoded URL expectations to include `${dpl}` suffix
4. For the link preload test, update the `entries.find()` calls to search for URLs that include the DPL parameter

This will align the test expectations with the actual application behavior that includes DPL parameters in image URLs.
