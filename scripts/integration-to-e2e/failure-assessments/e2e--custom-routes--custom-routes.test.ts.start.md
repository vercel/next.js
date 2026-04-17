# custom-routes: CONVERSION-BUG

## Summary

The test failures are caused by differences in how the e2e test framework handles static asset serving and rewrite rules compared to the original integration test framework. The converted test is failing because the new testing harness doesn't properly serve static assets or apply rewrite rules for Next.js data routes and build artifacts in production mode.

## Evidence

1. **Data route failure**: The test expects `/_next/data/${buildId}/overridden/first.json` to return 200 but gets 404, even though the page `/overridden/first` works correctly. This indicates the data route serving is broken.

2. **Static asset rewrite failure**: The rewrite rule `{source: '/hidden/_next/:path*', destination: '/_next/:path*'}` should serve `/_next/static/${buildId}/_buildManifest.js` when requesting `/hidden/_next/static/${buildId}/_buildManifest.js`, but it returns "Not Found" instead of the expected content containing "/hello".

3. **Snapshot normalization difference**: The routes manifest snapshot shows the actual buildId (`Roc9OZKVOL1Dkku8VpOlR`) instead of the normalized placeholder (`BUILD_ID`), suggesting the normalization process works differently in the e2e framework.

4. **Framework differences**: The original integration test uses `launchApp`/`nextStart` with direct file system access and `fetchViaHTTP`, while the e2e test uses `nextTestSetup` with `next.fetch()`. These different approaches handle static asset serving differently.

## Fix suggestion

The conversion needs to address how static assets and rewrites are handled in the e2e framework:

1. **Verify rewrite rules work**: Check if the rewrite rules in `next.config.js` are being applied correctly by the e2e test framework, particularly for `/_next/*` paths.

2. **Check static asset serving**: Ensure that `/_next/static/*` files are being generated and served correctly in production mode.

3. **Fix CLI output references**: The original test checks `stderr` but the converted test checks `next.cliOutput` - these may capture different output streams.

4. **Investigate data route generation**: The `/_next/data/*` routes may not be generated properly during the build step in the e2e framework.

This appears to be a systematic issue with how the e2e test framework handles Next.js internal routes and static assets compared to the integration test approach.
