/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // Opt every segment into Partial Prefetching, so an auto prefetch only warms
  // the shell (params -> Fallback) unless the link forces a full
  // prefetch. This is what makes the navigation lock restrict reads to the
  // shell.
  partialPrefetching: true,
  experimental: {
    // Enable the testing API in production builds for these tests.
    exposeTestingApiInProductionBuild: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
