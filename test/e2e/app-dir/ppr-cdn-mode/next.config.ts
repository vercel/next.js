import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // What new apps are told to use. Unknown params get the shared fallback
  // shell once, then their own document.
  partialPrefetching: true,
  experimental: {
    // On by default with Cache Components.
    // ppr-cdn-mode.cached-navigations-off.test.ts turns it off.
    cachedNavigations: process.env.PPR_CDN_MODE_CACHED_NAVIGATIONS !== 'false',
    // ppr-cdn-mode.testing-api.test.ts exposes the Instant Navigation Testing
    // API.
    exposeTestingApiInProductionBuild:
      process.env.PPR_CDN_MODE_TESTING_API === 'true',
  },
  // The suite's `.util.ts` helpers sit next to the app and import test-only
  // modules.
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
