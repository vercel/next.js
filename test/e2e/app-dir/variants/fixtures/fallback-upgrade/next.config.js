/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // An upgraded fallback shell only exists with Partial Prefetching, which
  // requires Cache Components. Enabled here rather than left to the test
  // matrix, so the route under test takes that path in every configuration.
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    variants: true,
  },
}

module.exports = nextConfig
