# middleware-prefetch: CONVERSION-BUG

## Summary

The test conversion incorrectly changed the logic for detecting prefetched scripts. The original integration test uses `getClientBuildManifestLoaderChunkUrlPath()` to get the actual chunk file URL from the build manifest, while the converted test naively looks for scripts containing the page path `/ssg-page`. Next.js prefetch works by loading JavaScript chunks with hashed filenames, not simple page paths, so the converted test's assertion will always fail.

## Evidence

1. **Original test logic (lines 68-73):** Uses `getClientBuildManifestLoaderChunkUrlPath(context.appDir, '/ssg-page')` to get the correct chunk URL to look for
2. **Converted test logic (line 20):** Simply checks `src.includes('/ssg-page')` which won't match actual chunk filenames like `pages/ssg-page-abc123.js`
3. **Test failure:** `expect(attrs.some((src) => src && src.includes('/ssg-page'))).toBe(true)` fails because no script src contains the literal string '/ssg-page'
4. **Existing assessment:** There's already a detailed analysis of this exact issue in `scripts/integration-to-e2e/failure-assessments/production--middleware-prefetch--middleware-prefetch.test.ts.start.md`
5. **Pattern in other converted tests:** Tests like `preload-viewport.test.ts` correctly import and use `getClientBuildManifestLoaderChunkUrlPath(next.testDir, '/route')`

## Fix suggestion

The converted test needs to:

1. Import `getClientBuildManifestLoaderChunkUrlPath` from 'next-test-utils'
2. Replace the naive string check with proper chunk URL lookup:
   ```typescript
   const chunk = getClientBuildManifestLoaderChunkUrlPath(
     next.testDir,
     '/ssg-page'
   )
   expect(attrs.some((src) => src && src.includes(chunk))).toBe(true)
   ```
