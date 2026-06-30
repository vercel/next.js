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
    // App Shells must be enabled for the shell restriction to apply — with it
    // off, every prefetch implicitly includes the speculative (non-shell) part
    // of the target, so there is nothing to restrict.
    appShells: true,
    // Enable the testing API in production builds for these tests.
    exposeTestingApiInProductionBuild: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
