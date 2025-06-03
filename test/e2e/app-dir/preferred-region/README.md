# preferredRegion Test

This test demonstrates the successful implementation of `preferredRegion` configuration support for Node.js runtime in Next.js App Router.

## Test Structure

- **`app/api/test/route.ts`** - Node.js runtime route handler with `preferredRegion = "iad1"` and `maxDuration = 100`
- **`app/api/test-edge/route.ts`** - Edge runtime route handler with `preferredRegion = "iad1"` and `maxDuration = 100`

## What the Test Shows

### ✅ Node.js Runtime (NOW WORKS!)

- Route handler exports `preferredRegion = "iad1"` and `maxDuration = 100`
- Gets processed and stored in `functions-config-manifest.json` as:
  ```json
  {
    "/api/test": {
      "maxDuration": 100,
      "regions": ["iad1"]
    }
  }
  ```
- Deployment platforms can now read `preferredRegion` for Node.js runtime

### ✅ Edge Runtime (CONTINUES TO WORK)

- Route handler exports `preferredRegion = "iad1"` and `maxDuration = 100`
- Gets processed and stored in both manifests:
  - `functions-config-manifest.json` under `functions["/api/test-edge"]`
  - `middleware-manifest.json` under `functions["/api/test-edge/route"]`

## Implementation Details

The fix was implemented by:

1. **Updated `FunctionsConfigManifest` interface** in `packages/next/src/build/index.ts` to include `regions` field
2. **Enhanced build logic** to check for `preferredRegion` configuration and convert it to `regions` array format
3. **Ensured consistency** with Edge runtime behavior for deployment platform compatibility

## Test Results

✅ All 3 tests pass:

- Node.js API route returns expected response
- Edge API route returns expected response
- **Both runtimes now correctly include `preferredRegion` in their respective manifests**

This resolves the original issue where `preferredRegion` was ignored for Node.js runtime functions.
