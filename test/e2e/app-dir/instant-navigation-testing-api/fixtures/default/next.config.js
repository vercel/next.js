/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // App Shells is enabled implicitly by `cacheComponents`. `prefetchInlining`
    // is kept `false` so the non-inlined (speculative per-segment) static
    // prefetch path is exercised alongside the app-shell prefetch.
    // Enable the testing API in production builds for these tests
    exposeTestingApiInProductionBuild: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
