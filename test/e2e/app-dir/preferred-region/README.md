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
- Deployment platforms can now read `regions` for Node.js runtime

### ✅ Edge Runtime (CONTINUES TO WORK)

- Route handler exports `preferredRegion = "iad1"` and `maxDuration = 100`
- Gets processed and stored in both manifests:
  - `functions-config-manifest.json` under `functions["/api/test-edge"]`
  - `middleware-manifest.json` under `functions["/api/test-edge/route"]`
