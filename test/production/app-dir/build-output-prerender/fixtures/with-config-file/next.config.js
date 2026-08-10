/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // Render one page at a time during the build so that prerender errors are
    // reported in a deterministic order, which the prerender output snapshots
    // rely on.
    staticGenerationMaxConcurrency: 1,
  },
}

module.exports = nextConfig
