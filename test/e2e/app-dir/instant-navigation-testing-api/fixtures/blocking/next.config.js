/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // Matches the `default` fixture: App Shells is implicit via
    // `cacheComponents`, `prefetchInlining` stays `false`. This fixture holds
    // routes with no static shell (a dynamic read outside any `<Suspense>`),
    // which fail `next build`'s static-shell validation, so its suite runs in
    // dev only and is never production-built.
    exposeTestingApiInProductionBuild: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
