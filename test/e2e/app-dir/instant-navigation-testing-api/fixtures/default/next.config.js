/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // The Instant Navigation devtools panel defaults to the dev tools position
  // (bottom-left). This suite's links are a left-aligned vertical list, so a
  // bottom-left panel overlaps them and intercepts clicks; move it aside.
  devIndicators: { position: 'bottom-right' },
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
