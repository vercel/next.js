/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // TODO(appShells): migrate this test to the two-phase (app shell +
    // per-page data) prefetch behavior, then remove this override. See #94516.
    appShells: false,
    // Enable the testing API in production builds for these tests
    exposeTestingApiInProductionBuild: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
