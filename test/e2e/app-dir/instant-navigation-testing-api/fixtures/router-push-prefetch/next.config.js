/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // Opt every segment into Partial Prefetching, so only a `prefetch={true}`
  // link warms the concrete-param entry of the destination route.
  partialPrefetching: true,
  experimental: {
    // Enable the testing API in production builds for these tests.
    exposeTestingApiInProductionBuild: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
