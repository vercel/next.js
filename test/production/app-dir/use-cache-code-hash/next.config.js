/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  supportsImmutableAssets: true,
  experimental: {
    durableUseCacheEntries: true,
    runtimeServerDeploymentId: true,
  },
}

module.exports = nextConfig
