/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // The standard App Shell setup (see the Runtime Prefetching guide): with
  // Partial Prefetching, the App Shell is the prefetch baseline for every
  // route, and a `<Link prefetch={true}>` to an `allow-runtime` route
  // upgrades to a runtime prefetch instead of a legacy full prefetch.
  partialPrefetching: true,
  // The Instant Navigation devtools panel defaults to the dev tools position
  // (bottom-left), where it can overlap the nav links and intercept clicks;
  // move it aside.
  devIndicators: { position: 'bottom-right' },
  experimental: {
    // App Shells is enabled implicitly by `cacheComponents`. `prefetchInlining`
    // is kept `false` for parity with the sibling fixtures, so the non-inlined
    // (speculative per-segment) static prefetch path is exercised alongside
    // the app-shell prefetch.
    // Enable the testing API in production builds for these tests.
    exposeTestingApiInProductionBuild: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
