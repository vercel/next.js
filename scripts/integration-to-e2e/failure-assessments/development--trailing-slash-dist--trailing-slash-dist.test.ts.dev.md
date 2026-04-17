# trailing-slash-dist: CONVERSION-BUG

## Summary

The test failure is caused by the conversion incorrectly translating the original test logic. The converted test tries to directly read `.next/build-manifest.json` in development mode, but this file only exists after production builds. The original test used `getPageFileFromBuildManifest()` utility function that can handle both development and production modes appropriately.

## Evidence

- **Error message**: `ENOENT: no such file or directory, open '/.../next-install-.../.next/build-manifest.json'`
- **Test mode**: The test is running in development mode (as indicated by the turbopack dev server starting)
- **Converted test issue**: Line 11 directly calls `next.readJSON('.next/build-manifest.json')` which assumes the file exists
- **Original test approach**: Used `getPageFileFromBuildManifest(appDir, '/')` utility function that handles mode differences
- **File existence**: The `.next/build-manifest.json` file is only generated during production builds, not in development mode

## Fix suggestion

The converted test should either:

1. **Use a different approach for development mode**: Replace the direct file reading with a method that works in development mode, such as using Next.js internal APIs or utilities that can extract the required page file information without relying on build artifacts
2. **Convert to production mode test**: Change this to a production build test where the build manifest file would actually exist
3. **Use the original utility function**: Import and use `getPageFileFromBuildManifest` from `next-test-utils` which handles both dev and production modes correctly

The most appropriate fix would be option 1, adapting the test logic to work with the development server's runtime information rather than build artifacts.
